import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { secureStorage } from '@/utils/secureStorage';
import { ENV } from '@/config/env';
import { API_TIMEOUT, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/config/constants';

class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
  }> = [];

  /**
   * In-flight GET de-duplication. Two screens that both call
   * `apiClient.get('/groups')` on mount used to fire two identical HTTP
   * requests in parallel; this map collapses them into one round trip and
   * gives both callers the same Promise. Keyed by URL + serialised params,
   * so callers with different filters do not share a response.
   *
   * Only GET is deduplicated — mutating verbs are intentionally untouched
   * because two callers genuinely intending the same POST should fire two
   * POSTs. The map drops entries as soon as the underlying request settles
   * (success or failure), so a failed read can be retried immediately.
   */
  private inflightGets = new Map<string, Promise<unknown>>();

  constructor() {
    this.client = axios.create({
      baseURL: ENV.apiUrl,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor — attach auth token and fix multipart uploads.
    // React Native does NOT strip the axios default Content-Type: application/json
    // when the body is FormData (unlike browsers). Deleting it here lets the
    // native XHR layer set multipart/form-data; boundary=... automatically.
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        if (config.data instanceof FormData) {
          delete config.headers['Content-Type'];
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
            const refreshToken = await secureStorage.getItemAsync(REFRESH_TOKEN_KEY);
            if (!refreshToken) {
              this.processQueue(null, new Error('No refresh token'));
              return Promise.reject(error);
            }

            const { data } = await axios.post(`${ENV.apiUrl}/auth/refresh`, {
              refreshToken,
            });

            const newAccessToken = data.tokens.accessToken;
            const newRefreshToken = data.tokens.refreshToken;

            await secureStorage.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken);
            await secureStorage.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);

            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            this.processQueue(newAccessToken, null);

            return this.client(originalRequest);
          } catch (refreshError) {
            this.processQueue(null, refreshError);
            await secureStorage.deleteItemAsync(ACCESS_TOKEN_KEY);
            await secureStorage.deleteItemAsync(REFRESH_TOKEN_KEY);
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

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    // Stable cache key. JSON.stringify(undefined) → undefined, so we fall
    // back to '' to keep the key consistent with no-params calls.
    const paramKey = params ? JSON.stringify(params) : '';
    const key = `${url}::${paramKey}`;

    const existing = this.inflightGets.get(key);
    if (existing) return existing as Promise<T>;

    const promise = this.client
      .get<T>(url, { params })
      .then((response) => response.data)
      .finally(() => {
        // Remove ourselves from the map only AFTER the promise settles.
        // Callers awaiting a still-pending request continue to get the
        // existing promise (cached above); a brand-new request fires only
        // once the previous one has resolved or rejected.
        this.inflightGets.delete(key);
      });

    this.inflightGets.set(key, promise);
    return promise;
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
