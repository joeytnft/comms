import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ScheduleScreen } from '@/screens/Schedule/ScheduleScreen';
import { ServiceDetailScreen } from '@/screens/Schedule/ServiceDetailScreen';
import { COLORS } from '@/config/theme';

export type ScheduleStackParamList = {
  Schedule: undefined;
  ServiceDetail: { serviceId: string };
};

const Stack = createNativeStackNavigator<ScheduleStackParamList>();

export function ScheduleStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.textPrimary,
      }}
    >
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
