import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GroupListScreen } from '@/screens/Groups/GroupListScreen';
import { GroupDetailScreen } from '@/screens/Groups/GroupDetailScreen';
import { CreateGroupScreen } from '@/screens/Groups/CreateGroupScreen';
import { ChatRoomScreen } from '@/screens/Chat/ChatRoomScreen';
import { COLORS } from '@/config/theme';

export type GroupStackParamList = {
  GroupList: undefined;
  GroupDetail: { groupId: string };
  CreateGroup: undefined;
  ChatRoom: { groupId: string; groupName: string };
};

const Stack = createNativeStackNavigator<GroupStackParamList>();

export function GroupStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.textPrimary,
      }}
    >
      <Stack.Screen
        name="GroupList"
        component={GroupListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GroupDetail"
        component={GroupDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChatRoom"
        component={ChatRoomScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
