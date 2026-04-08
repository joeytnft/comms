import React, { createContext, useContext, useEffect } from 'react';
import { User, LoginCredentials, RegisterData } from '@/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';

interface Organization {
  id: string;
  name: string;
  inviteCode: string;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, organization, isLoading, isAuthenticated, login, register, logout: authLogout, refreshSession, loadStoredSession } = useAuthStore();
  const { fetchSubscription, clear: clearSubscription } = useSubscriptionStore();

  // Check for existing session on mount
  useEffect(() => {
    loadStoredSession();
  }, []);

  // Fetch subscription when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchSubscription();
    }
  }, [isAuthenticated, user]);

  const logout = async () => {
    clearSubscription();
    await authLogout();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        isLoading,
        isAuthenticated,
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
