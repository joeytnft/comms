import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AuthProvider } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { PTTProvider } from '@/contexts/PTTContext';
import { AppNavigator } from '@/navigation/AppNavigator';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <AuthProvider>
            <SocketProvider>
              <PTTProvider>
                <StatusBar style="light" />
                <AppNavigator />
              </PTTProvider>
            </SocketProvider>
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
