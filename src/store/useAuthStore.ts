import { create } from 'zustand';
import { secureStorage } from '@/utils/secureStorage';
import { User, AuthTokens, LoginCredentials, RegisterData } from '@/types';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY } from '@/config/constants';
import { authService } from '@/services/authService';
import { biometricAuth } from '@/utils/biometricAuth';

interface Organization {
  id: string;
  name: string;
  inviteCode: string;
}

interface AuthState {
  user: User | null;
  organization: Organization | null;
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
  await secureStorage.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  await secureStorage.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

async function clearTokens(): Promise<void> {
  await secureStorage.deleteItemAsync(ACCESS_TOKEN_KEY);
  await secureStorage.deleteItemAsync(REFRESH_TOKEN_KEY);
  await secureStorage.deleteItemAsync(USER_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  organization: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
    if (user) {
      secureStorage.setItemAsync(USER_KEY, JSON.stringify(user)).catch(() => null);
    }
  },

  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const { user, tokens } = await authService.login(credentials);
      await storeTokens(tokens);
      await secureStorage.setItemAsync(USER_KEY, JSON.stringify(user));
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
      await secureStorage.setItemAsync(USER_KEY, JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      const refreshToken = await secureStorage.getItemAsync(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        await authService.logout(refreshToken).catch(() => {
          // Server logout is best-effort; clear local state regardless
        });
      }
    } finally {
      await clearTokens();
      await biometricAuth.clearLoginCredentials();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  refreshSession: async () => {
    const refreshToken = await secureStorage.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const { tokens } = await authService.refresh(refreshToken);
      await storeTokens(tokens);

      // Re-fetch user profile so role and other derived fields stay current
      try {
        const { user: freshUser, organization } = await authService.getMe();
        set({ user: freshUser, organization: organization ?? null });
        await secureStorage.setItemAsync(USER_KEY, JSON.stringify(freshUser));
      } catch {
        // Non-fatal — tokens were refreshed, profile fetch can retry later
      }
    } catch {
      // Refresh failed — session is expired
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  loadStoredSession: async () => {
    try {
      const accessToken = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
      const userJson = await secureStorage.getItemAsync(USER_KEY);

      if (!accessToken || !userJson) {
        set({ isLoading: false });
        return;
      }

      const user = JSON.parse(userJson) as User;
      set({ user, isAuthenticated: true, isLoading: false });

      // Validate the session by fetching current user in the background
      try {
        const { user: freshUser, organization } = await authService.getMe();
        set({ user: freshUser, organization: organization ?? null });
        await secureStorage.setItemAsync(USER_KEY, JSON.stringify(freshUser));
      } catch {
        // getMe() failed AND the interceptor's refresh attempt (if any) already failed
        // and cleared the tokens. A second refreshSession() here races with the
        // interceptor's own POST /auth/refresh, causing two concurrent refresh calls
        // with the same token — one wins, one gets 401, and the interceptor's failure
        // path clears state regardless. Just reset to logged-out.
        await clearTokens();
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
