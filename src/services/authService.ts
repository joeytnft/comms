import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { User, AuthTokens, LoginCredentials, RegisterData } from '@/types';

interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

interface RefreshResponse {
  tokens: AuthTokens;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>(ENDPOINTS.AUTH.LOGIN, credentials);
  },

  async register(data: RegisterData): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>(ENDPOINTS.AUTH.REGISTER, data);
  },

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    return apiClient.post<RefreshResponse>(ENDPOINTS.AUTH.REFRESH, { refreshToken });
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post(ENDPOINTS.AUTH.LOGOUT, { refreshToken });
  },

  async getMe(): Promise<{ user: User }> {
    return apiClient.get<{ user: User }>(ENDPOINTS.USERS.ME);
  },
};
