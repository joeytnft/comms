import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useGroupStore } from '@/store/useGroupStore';
import { Button, Input } from '@/components/common';
import { GroupType } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { MAX_GROUP_NAME_LENGTH, MAX_GROUP_DESCRIPTION_LENGTH, GROUP_COLORS } from '@/config/constants';
import { GroupStackParamList } from '@/navigation/GroupStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<GroupStackParamList, 'CreateGroup'>;
  route: RouteProp<GroupStackParamList, 'CreateGroup'>;
};

export function CreateGroupScreen({ navigation, route }: Props) {
  const { groups, createGroup, fetchGroups, isLoading } = useGroupStore();
  const defaultType = route.params?.defaultType ?? 'lead';
  const defaultParentGroupId = route.params?.defaultParentGroupId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<GroupType>(defaultType);
  const [parentGroupId, setParentGroupId] = useState<string | undefined>(defaultParentGroupId);
  const [iconColor, setIconColor] = useState(GROUP_COLORS[0]);

  const leadGroups = groups.filter((g) => g.type === 'lead');

  useEffect(() => {
    fetchGroups();
  }, []);

  // Reset parent when switching to LEAD type
  useEffect(() => {
    if (type === 'lead') {
      setParentGroupId(undefined);
    } else if (leadGroups.length > 0 && !parentGroupId) {
      setParentGroupId(defaultParentGroupId ?? leadGroups[0].id);
    }
  }, [type]);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Group name is required.');
      return;
    }
    if (type === 'sub' && !parentGroupId) {
      Alert.alert('Error', 'Please select a parent lead group.');
      return;
    }

    try {
      await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        parentGroupId: type === 'sub' ? parentGroupId : undefined,
        iconColor,
      });
      navigation.goBack();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create group';
      Alert.alert('Error', message);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Group</Text>

        <Input
          label="Group Name *"
          value={name}
          onChangeText={(text) => setName(text.slice(0, MAX_GROUP_NAME_LENGTH))}
          placeholder="e.g., Security Lead, Parking Team"
        />

        <Input
          label="Description"
          value={description}
          onChangeText={(text) => setDescription(text.slice(0, MAX_GROUP_DESCRIPTION_LENGTH))}
          placeholder="Brief description of this group"
          multiline
          numberOfLines={2}
          containerStyle={styles.field}
        />

        {/* Type picker */}
        <View style={styles.field}>
          <Text style={styles.label}>Group Type *</Text>
          <View style={styles.typePicker}>
            <TouchableOpacity
              style={[styles.typeOption, type === 'lead' && styles.typeOptionSelected]}
              onPress={() => setType('lead')}
            >
              <Text style={[styles.typeOptionText, type === 'lead' && styles.typeOptionTextSelected]}>
                Lead Group
              </Text>
              <Text style={styles.typeOptionDesc}>Sees all sub-group activity</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeOption, type === 'sub' && styles.typeOptionSelected]}
              onPress={() => setType('sub')}
            >
              <Text style={[styles.typeOptionText, type === 'sub' && styles.typeOptionTextSelected]}>
                Sub Group
              </Text>
              <Text style={styles.typeOptionDesc}>Isolated team channel</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Parent group picker (only for SUB) */}
        {type === 'sub' && (
          <View style={styles.field}>
            <Text style={styles.label}>Parent Lead Group *</Text>
            {leadGroups.length === 0 ? (
              <Text style={styles.noLeadText}>
                No lead groups exist yet. Create a lead group first.
              </Text>
            ) : (
              <View style={styles.parentPicker}>
                {leadGroups.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      styles.parentOption,
                      parentGroupId === g.id && styles.parentOptionSelected,
                    ]}
                    onPress={() => setParentGroupId(g.id)}
                  >
                    <View style={[styles.parentDot, { backgroundColor: g.iconColor || COLORS.accent }]} />
                    <Text
                      style={[
                        styles.parentOptionText,
                        parentGroupId === g.id && styles.parentOptionTextSelected,
                      ]}
                    >
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Color picker */}
        <View style={styles.field}>
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorPicker}>
            {GROUP_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  iconColor === color && styles.colorOptionSelected,
                ]}
                onPress={() => setIconColor(color)}
              />
            ))}
          </View>
        </View>

        <Button
          title="Create Group"
          onPress={handleCreate}
          loading={isLoading}
          disabled={!name.trim() || (type === 'sub' && !parentGroupId)}
          style={styles.submitButton}
        />

        <Button
          title="Cancel"
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={styles.cancelButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  field: {
    marginTop: SPACING.md,
  },
  label: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  typePicker: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  typeOption: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.gray700,
    ...SHADOWS.sm,
  },
  typeOptionSelected: {
    borderColor: COLORS.accent,
  },
  typeOptionText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  typeOptionTextSelected: {
    color: COLORS.accent,
  },
  typeOptionDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  parentPicker: {
    gap: SPACING.sm,
  },
  parentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.gray700,
  },
  parentOptionSelected: {
    borderColor: COLORS.accent,
  },
  parentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.sm,
  },
  parentOptionText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
  },
  parentOptionTextSelected: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  noLeadText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.warning,
    fontStyle: 'italic',
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: COLORS.white,
    borderWidth: 3,
  },
  submitButton: {
    marginTop: SPACING.xl,
  },
  cancelButton: {
    marginTop: SPACING.sm,
  },
});
