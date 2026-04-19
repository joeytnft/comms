import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TrainingListScreen } from '@/screens/Training/TrainingListScreen';
import { TrainingDetailScreen } from '@/screens/Training/TrainingDetailScreen';
import { CreateTrainingScreen } from '@/screens/Training/CreateTrainingScreen';
import { QualificationTypesScreen } from '@/screens/Qualifications/QualificationTypesScreen';
import { MemberQualificationsScreen } from '@/screens/Qualifications/MemberQualificationsScreen';
import { COLORS } from '@/config/theme';

export type TrainingStackParamList = {
  TrainingList: undefined;
  TrainingDetail: { trainingId: string };
  CreateTraining: { trainingId?: string };
  QualificationTypes: undefined;
  MemberQualifications: { userId: string; memberName?: string };
};

const Stack = createNativeStackNavigator<TrainingStackParamList>();

export function TrainingStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.textPrimary,
      }}
    >
      <Stack.Screen
        name="TrainingList"
        component={TrainingListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TrainingDetail"
        component={TrainingDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateTraining"
        component={CreateTrainingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="QualificationTypes"
        component={QualificationTypesScreen}
        options={{ title: 'Qualification Types' }}
      />
      <Stack.Screen
        name="MemberQualifications"
        component={MemberQualificationsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
