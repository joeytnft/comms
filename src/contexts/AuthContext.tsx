import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, AuthTokens, LoginCredentials, RegisterData } from '@/types';
// TODO: Import from actual services when implemented
// import { authService } from '@/services/authService';
// import * as SecureStore from 'expo-secure-store';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      // TODO: Check SecureStore for existing tokens, validate, load user
      setIsLoading(false);
    } catch {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      // TODO: Implement actual login
      // const { user, tokens } = await authService.login(credentials);
      // await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
      // await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
      // setUser(user);
      throw new Error('Not implemented');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    try {
      // TODO: Implement actual registration
      throw new Error('Not implemented');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // TODO: Clear tokens, disconnect socket, clear state
    setUser(null);
  }, []);

  const refreshSession = useCallback(async () => {
    // TODO: Refresh JWT using refresh token
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
