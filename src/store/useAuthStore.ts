import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, AuthTokens, LoginCredentials, RegisterData } from '@/types';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY } from '@/config/constants';
import { authService } from '@/services/authService';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  loadStoredSession: () => Promise<void>;
  setUser: (user: User | null) => void;
}

async function storeTokens(tokens: AuthTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const { user, tokens } = await authService.login(credentials);
      await storeTokens(tokens);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (data) => {
    set({ isLoading: true });
    try {
      const { user, tokens } = await authService.register(data);
      await storeTokens(tokens);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        await authService.logout(refreshToken).catch(() => {
          // Server logout is best-effort; clear local state regardless
        });
      }
    } finally {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  refreshSession: async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const { tokens } = await authService.refresh(refreshToken);
      await storeTokens(tokens);
    } catch {
      // Refresh failed — session is expired
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  loadStoredSession: async () => {
    try {
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);

      if (!accessToken || !userJson) {
        set({ isLoading: false });
        return;
      }

      const user = JSON.parse(userJson) as User;
      set({ user, isAuthenticated: true, isLoading: false });

      // Validate the session by fetching current user in the background
      try {
        const { user: freshUser } = await authService.getMe();
        set({ user: freshUser });
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(freshUser));
      } catch {
        // Token may be expired — try refresh
        await get().refreshSession();
      }
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
