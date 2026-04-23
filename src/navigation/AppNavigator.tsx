import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLock } from '@/contexts/AppLockContext';
import { COLORS } from '@/config/theme';
import { LoginScreen } from '@/screens/Auth/LoginScreen';
import { RegisterScreen } from '@/screens/Auth/RegisterScreen';
import { ForgotPasswordScreen } from '@/screens/Auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from '@/screens/Auth/ResetPasswordScreen';
import { AcceptInviteScreen } from '@/screens/Auth/AcceptInviteScreen';
import { PinEntryScreen } from '@/screens/Auth/PinEntryScreen';
import { MainTabNavigator } from './MainTabNavigator';

export const navigationRef = createNavigationContainerRef();

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
  AcceptInvite: { token?: string };
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function navigateToChat(groupId: string, groupName: string) {
  if (!navigationRef.isReady()) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (navigationRef as any).navigate('Main', {
    screen: 'Groups',
    params: { screen: 'ChatRoom', params: { groupId, groupName } },
  });
}

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isLocked, unlock } = useAppLock();

  useEffect(() => {
    // Handle notification taps while app is running (background → foreground)
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'message' && typeof data.groupId === 'string' && typeof data.groupName === 'string') {
        navigateToChat(data.groupId, data.groupName);
      }
    });

    // Handle the notification that launched the app from a killed state
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'message' && typeof data.groupId === 'string' && typeof data.groupName === 'string') {
        navigateToChat(data.groupId, data.groupName);
      }
    });

    return () => sub.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // Show PIN entry screen over the top of everything when locked
  if (isAuthenticated && isLocked) {
    return <PinEntryScreen onUnlock={unlock} />;
  }

  const linking = {
    prefixes: ['gathersafe://'],
    config: {
      screens: {
        AcceptInvite: 'accept-invite',
        ResetPassword: 'reset-password',
        Login: 'login',
      },
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={{
        dark: true,
        colors: {
          primary: COLORS.accent,
          background: COLORS.background,
          card: COLORS.surface,
          text: COLORS.textPrimary,
          border: COLORS.gray700,
          notification: COLORS.danger,
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main" component={MainTabNavigator} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
            <Stack.Screen name="AcceptInvite" component={AcceptInviteScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
