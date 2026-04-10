import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsScreen } from '@/screens/Settings/SettingsScreen';
import { SubscriptionScreen } from '@/screens/Settings/SubscriptionScreen';
import { GeofenceScreen } from '@/screens/Settings/GeofenceScreen';
import { PTTConfigScreen } from '@/screens/Settings/PTTConfigScreen';
import { TeamMapScreen } from '@/screens/Map/TeamMapScreen';
import { IncidentStackNavigator } from './IncidentStackNavigator';
import { ScheduleStackNavigator } from './ScheduleStackNavigator';
import { CampusManagementScreen } from '@/screens/Settings/CampusManagementScreen';
import { COLORS } from '@/config/theme';

export type MoreStackParamList = {
  MoreMenu: undefined;
  Subscription: undefined;
  TeamMap: undefined;
  Incidents: undefined;
  Geofence: undefined;
  PTTConfig: undefined;
  Schedule: undefined;
  CampusManagement: undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.textPrimary,
      }}
    >
      <Stack.Screen
        name="MoreMenu"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ title: 'Subscription' }}
      />
      <Stack.Screen
        name="TeamMap"
        component={TeamMapScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Incidents"
        component={IncidentStackNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Geofence"
        component={GeofenceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PTTConfig"
        component={PTTConfigScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Schedule"
        component={ScheduleStackNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CampusManagement"
        component={CampusManagementScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
