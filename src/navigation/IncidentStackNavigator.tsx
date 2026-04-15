import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IncidentListScreen } from '@/screens/Incidents/IncidentListScreen';
import { IncidentDetailScreen } from '@/screens/Incidents/IncidentDetailScreen';
import { IncidentReportScreen } from '@/screens/Incidents/IncidentReportScreen';
import { ResponsePlansScreen } from '@/screens/Incidents/ResponsePlansScreen';
import { COLORS } from '@/config/theme';

export type IncidentStackParamList = {
  IncidentList: undefined;
  IncidentDetail: { incidentId: string };
  IncidentReport: undefined;
  ResponsePlans: undefined;
};

const Stack = createNativeStackNavigator<IncidentStackParamList>();

export function IncidentStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.textPrimary,
      }}
    >
      <Stack.Screen
        name="IncidentList"
        component={IncidentListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="IncidentDetail"
        component={IncidentDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="IncidentReport"
        component={IncidentReportScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ResponsePlans"
        component={ResponsePlansScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
