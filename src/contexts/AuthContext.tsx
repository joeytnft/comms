import React, { createContext, useContext, useEffect } from 'react';
import { User, LoginCredentials, RegisterData } from '@/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { notificationService } from '@/services/notificationService';
import { revenueCatService } from '@/services/revenueCatService';
import { reportCrash } from '@/utils/logger';

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
      // Use the organization ID so all org members share the same RevenueCat
      // customer record — the org owner's purchase covers the whole team.
      revenueCatService.identify(user.organizationId).catch((err) => {
        // Non-fatal — SDK will continue in anonymous mode — but we want to
        // know about it so subscription bugs are diagnosable.
        reportCrash({ err, context: 'AuthContext.revenueCatIdentify' });
      });
      fetchSubscription();
      fetchCustomerInfo();
      // Push-token registration was previously fire-and-forget with no error
      // path. Silent failure means push notifications stop working forever
      // until next login — log it so we can see when it happens.
      notificationService.registerPushToken().catch((err) => {
        reportCrash({ err, context: 'AuthContext.registerPushToken' });
      });
    }
  }, [isAuthenticated, user]);

  const logout = async () => {
    clearSubscription();
    await notificationService.unregisterPushToken();
    await authLogout();
    // Reset RevenueCat to anonymous customer after logout
    revenueCatService.logOut().catch((err) => {
      reportCrash({ err, context: 'AuthContext.revenueCatLogout' });
    });
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
