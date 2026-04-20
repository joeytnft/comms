import React, { createContext, useContext, useEffect } from 'react';
import { User, LoginCredentials, RegisterData } from '@/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { notificationService } from '@/services/notificationService';
import { revenueCatService } from '@/services/revenueCatService';

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
  const { fetchSubscription, fetchCustomerInfo, clear: clearSubscription } = useSubscriptionStore();

  // Check for existing session on mount
  useEffect(() => {
    loadStoredSession();
  }, []);

  // Identify RevenueCat customer, fetch subscription and register push token on login
  useEffect(() => {
    if (isAuthenticated && user) {
      revenueCatService.identify(user.id).catch(() => {
        // Non-fatal — SDK will continue in anonymous mode
      });
      fetchSubscription();
      fetchCustomerInfo();
      notificationService.registerPushToken();
    }
  }, [isAuthenticated, user]);

  const logout = async () => {
    clearSubscription();
    await notificationService.unregisterPushToken();
    await authLogout();
    // Reset RevenueCat to anonymous customer after logout
    revenueCatService.logOut().catch(() => {});
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
