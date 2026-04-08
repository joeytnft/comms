import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View, Text } from 'react-native';
import { COLORS, TYPOGRAPHY } from '@/config/theme';

import { DashboardScreen } from '@/screens/Home/DashboardScreen';
import { GroupStackNavigator } from './GroupStackNavigator';
import { PTTScreen } from '@/screens/PTT/PTTScreen';
import { AlertsScreen } from '@/screens/Alerts/AlertsScreen';
import { MoreStackNavigator } from './MoreStackNavigator';

export type MainTabParamList = {
  Dashboard: undefined;
  Groups: undefined;
  PTT: undefined;
  Alerts: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.surface,
        },
        headerTintColor: COLORS.textPrimary,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.gray700,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: COLORS.info,
        tabBarInactiveTintColor: COLORS.gray500,
        tabBarLabelStyle: {
          ...TYPOGRAPHY.caption,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon label="H" color={color} />,
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupStackNavigator}
        options={{
          title: 'Channels',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon label="Ch" color={color} />,
        }}
      />
      <Tab.Screen
        name="PTT"
        component={PTTScreen}
        options={{
          title: 'Talk',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon label="T" color={color} isPTT />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon label="!" color={color} isAlert />,
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreStackNavigator}
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon label="⚙" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

// Temporary icon placeholder — replace with proper icons
function TabIcon({
  label,
  color,
  isPTT = false,
  isAlert = false,
}: {
  label: string;
  color: string;
  isPTT?: boolean;
  isAlert?: boolean;
}) {
  return (
    <View style={[styles.iconContainer, isPTT && styles.pttIcon, isAlert && styles.alertIcon]}>
      <Text style={[styles.iconText, { color: isPTT || isAlert ? COLORS.white : color }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pttIcon: {
    backgroundColor: COLORS.danger,
    borderRadius: 14,
    width: 36,
    height: 36,
  },
  alertIcon: {
    backgroundColor: COLORS.warning,
    borderRadius: 14,
    width: 32,
    height: 32,
  },
  iconText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
