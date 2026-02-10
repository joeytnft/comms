import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { ENV } from '@/config/env';
import { API_TIMEOUT, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/config/constants';

class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor() {
    this.client = axios.create({
      baseURL: ENV.apiUrl,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor — attach auth token
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor — handle 401, refresh tokens
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // Another refresh is in progress — queue this request
            return new Promise((resolve, reject) => {
              this.refreshQueue.push({
                resolve: (token: string) => {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                  resolve(this.client(originalRequest));
                },
                reject,
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
            if (!refreshToken) {
              this.processQueue(null, new Error('No refresh token'));
              return Promise.reject(error);
            }

            const { data } = await axios.post(`${ENV.apiUrl}/auth/refresh`, {
              refreshToken,
            });

            const newAccessToken = data.tokens.accessToken;
            const newRefreshToken = data.tokens.refreshToken;

            await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken);
            await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);

            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            this.processQueue(newAccessToken, null);

            return this.client(originalRequest);
          } catch (refreshError) {
            this.processQueue(null, refreshError);
            await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      },
    );
  }

  private processQueue(token: string | null, error: unknown) {
    for (const pending of this.refreshQueue) {
      if (error) {
        pending.reject(error);
      } else {
        pending.resolve(token!);
      }
    }
    this.refreshQueue = [];
  }

  get instance() {
    return this.client;
  }

  async get<T>(url: string, params?: Record<string, unknown>) {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: unknown) {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: unknown) {
    const response = await this.client.put<T>(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown) {
    const response = await this.client.patch<T>(url, data);
    return response.data;
  }

  async delete<T>(url: string) {
    const response = await this.client.delete<T>(url);
    return response.data;
  }
}

export const apiClient = new ApiClient();
