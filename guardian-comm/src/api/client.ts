import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ENV } from '@/config/env';
import { API_TIMEOUT } from '@/config/constants';
// TODO: Import SecureStore for token management
// import * as SecureStore from 'expo-secure-store';
// import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/config/constants';

class ApiClient {
  private client: AxiosInstance;

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
        // TODO: Get token from SecureStore
        // const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        // if (token) {
        //   config.headers.Authorization = `Bearer ${token}`;
        // }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor — handle 401, refresh tokens
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // TODO: Attempt token refresh
          // const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
          // if (refreshToken) {
          //   try {
          //     const { data } = await axios.post(`${ENV.apiUrl}/auth/refresh`, { refreshToken });
          //     await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken);
          //     // Retry original request
          //     return this.client(error.config!);
          //   } catch {
          //     // Refresh failed — force logout
          //   }
          // }
        }
        return Promise.reject(error);
      },
    );
  }

  get instance() {
    return this.client;
  }

  // Convenience methods
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

  async delete<T>(url: string) {
    const response = await this.client.delete<T>(url);
    return response.data;
  }
}

export const apiClient = new ApiClient();
