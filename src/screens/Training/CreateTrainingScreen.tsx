import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTrainingStore } from '@/store/useTrainingStore';
import { useGroupStore } from '@/store/useGroupStore';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';
import { TrainingStackParamList } from '@/navigation/TrainingStackNavigator';
import { Group } from '@/types';

type Nav = NativeStackNavigationProp<TrainingStackParamList>;
type RouteT = RouteProp<TrainingStackParamList, 'CreateTraining'>;

function FormField({
  label,
  children,
  optional,
}: {
  label: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional && <Text style={styles.optional}> (optional)</Text>}
      </Text>
      {children}
    </View>
  );
}

export function CreateTrainingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const isEdit = !!route.params?.trainingId;

  const { currentTraining, createTraining, updateTraining, fetchTraining } = useTrainingStore();
  const { groups, fetchGroups } = useGroupStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchGroups();
    if (isEdit && route.params.trainingId) {
      fetchTraining(route.params.trainingId);
    }
  }, []);

  // Pre-fill form when editing
  useEffect(() => {
    if (isEdit && currentTraining && currentTraining.id === route.params?.trainingId) {
      setTitle(currentTraining.title);
      setDescription(currentTraining.description ?? '');
      setLocation(currentTraining.location ?? '');
      const s = new Date(currentTraining.startDate);
      setStartDate(s.toISOString().split('T')[0]);
      setStartTime(
        s.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      );
      if (currentTraining.endDate) {
        const e = new Date(currentTraining.endDate);
        setEndTime(
          e.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        );
      }
      setMaxAttendees(currentTraining.maxAttendees?.toString() ?? '');
      setSelectedGroupIds(currentTraining.groupTargets.map((t) => t.groupId));
    }
  }, [currentTraining?.id]);

  const buildDateTime = (date: string, time: string): string => {
    return new Date(`${date}T${time || '00:00'}:00`).toISOString();
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Validation', 'Title is required');
      return;
    }
    if (!startDate) {
      Alert.alert('Validation', 'Start date is required');
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startDate: buildDateTime(startDate, startTime),
        endDate: endTime ? buildDateTime(startDate, endTime) : undefined,
        maxAttendees: maxAttendees ? parseInt(maxAttendees, 10) : undefined,
        groupIds: selectedGroupIds,
      };

      if (isEdit && route.params.trainingId) {
        await updateTraining(route.params.trainingId, data);
      } else {
        await createTraining(data);
      }
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save training');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const selectedGroupNames = groups
    .filter((g) => selectedGroupIds.includes(g.id))
    .map((g) => g.name)
    .join(', ');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Training' : 'New Training'}</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving} style={styles.saveBtn}>
          {isSaving ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <FormField label="Title">
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. CPR Certification Course"
            placeholderTextColor={COLORS.textSecondary}
          />
        </FormField>

        <FormField label="Description" optional>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What will this training cover?"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </FormField>

        <FormField label="Location" optional>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Room, building, or address"
            placeholderTextColor={COLORS.textSecondary}
          />
        </FormField>

        <FormField label="Date">
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="numeric"
          />
        </FormField>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Start Time</Text>
            <TextInput
              style={styles.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
            />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>
              End Time <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="11:00"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
            />
          </View>
        </View>

        <FormField label="Max Attendees" optional>
          <TextInput
            style={styles.input}
            value={maxAttendees}
            onChangeText={setMaxAttendees}
            placeholder="Leave blank for unlimited"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="number-pad"
          />
        </FormField>

        <FormField label="Visible to Teams" optional>
          <TouchableOpacity
            style={[styles.input, styles.selectInput]}
            onPress={() => setShowGroupPicker(true)}
          >
            <Text
              style={[
                styles.selectText,
                !selectedGroupNames && { color: COLORS.textSecondary },
              ]}
              numberOfLines={1}
            >
              {selectedGroupNames || 'All teams (no restriction)'}
            </Text>
          </TouchableOpacity>
        </FormField>
      </ScrollView>

      {/* Group picker modal */}
      <Modal visible={showGroupPicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Teams</Text>
              <TouchableOpacity onPress={() => setShowGroupPicker(false)}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.pickerHint}>
              Leave all unselected to show this training to all teams.
            </Text>
            <FlatList
              data={groups}
              keyExtractor={(g) => g.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => toggleGroup(item.id)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selectedGroupIds.includes(item.id) && styles.checkboxChecked,
                    ]}
                  >
                    {selectedGroupIds.includes(item.id) && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                  <View style={[styles.groupDot, { backgroundColor: item.iconColor ?? COLORS.primary }]} />
                  <Text style={styles.pickerRowText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cancelBtn: { minWidth: 60 },
  cancelText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  headerTitle: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary },
  saveBtn: { minWidth: 60, alignItems: 'flex-end' },
  saveText: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '700' },
  form: { padding: SPACING.md, gap: SPACING.sm },
  field: { gap: 6 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  label: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  optional: { fontWeight: '400', color: COLORS.textSecondary },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  selectInput: { justifyContent: 'center' },
  selectText: { ...TYPOGRAPHY.body, color: COLORS.textPrimary },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  pickerTitle: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary },
  pickerDone: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '700' },
  pickerHint: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  pickerRowText: { ...TYPOGRAPHY.body, color: COLORS.textPrimary },
});
