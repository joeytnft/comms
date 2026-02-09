import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View, Text } from 'react-native';
import { COLORS, TYPOGRAPHY } from '@/config/theme';

// TODO: Replace with actual screen imports as they are built
// import { DashboardScreen } from '@/screens/Home/DashboardScreen';
// import { ChatListScreen } from '@/screens/Chat/ChatListScreen';
// import { PTTScreen } from '@/screens/PTT/PTTScreen';
// import { AlertsScreen } from '@/screens/Alerts/AlertsScreen';
// import { SettingsScreen } from '@/screens/Settings/SettingsScreen';

// Placeholder screens until real ones are built
const PlaceholderScreen = ({ name }: { name: string }) => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>{name}</Text>
    <Text style={styles.placeholderSubtext}>Coming in next phase</Text>
  </View>
);

const DashboardScreen = () => <PlaceholderScreen name="Dashboard" />;
const ChatListScreen = () => <PlaceholderScreen name="Messages" />;
const PTTScreen = () => <PlaceholderScreen name="Push to Talk" />;
const AlertsScreen = () => <PlaceholderScreen name="Alerts" />;
const SettingsScreen = () => <PlaceholderScreen name="Settings" />;

export type MainTabParamList = {
  Dashboard: undefined;
  Messages: undefined;
  PTT: undefined;
  Alerts: undefined;
  Settings: undefined;
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
          // TODO: Add icons — use @expo/vector-icons or custom SVGs
          tabBarIcon: ({ color }) => <TabIcon label="H" color={color} />,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={ChatListScreen}
        options={{
          tabBarIcon: ({ color }) => <TabIcon label="M" color={color} />,
        }}
      />
      <Tab.Screen
        name="PTT"
        component={PTTScreen}
        options={{
          title: 'Talk',
          tabBarIcon: ({ color }) => <TabIcon label="T" color={color} isPTT />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarIcon: ({ color }) => <TabIcon label="A" color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color }) => <TabIcon label="S" color={color} />,
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
}: {
  label: string;
  color: string;
  isPTT?: boolean;
}) {
  return (
    <View style={[styles.iconContainer, isPTT && styles.pttIcon]}>
      <Text style={[styles.iconText, { color: isPTT ? COLORS.white : color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  placeholderText: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
  },
  placeholderSubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
    marginTop: 8,
  },
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
  iconText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
