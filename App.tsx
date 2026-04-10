import { polyfillWebCrypto } from 'expo-standard-web-crypto';
polyfillWebCrypto();
// Register background tasks before any component renders
import '@/services/geofenceService';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AuthProvider } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { PTTProvider } from '@/contexts/PTTContext';
import { AppLockProvider } from '@/contexts/AppLockContext';
import { AppNavigator } from '@/navigation/AppNavigator';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <AuthProvider>
            <AppLockProvider>
              <SocketProvider>
                <PTTProvider>
                  <StatusBar style="light" />
                  <AppNavigator />
                </PTTProvider>
              </SocketProvider>
            </AppLockProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
