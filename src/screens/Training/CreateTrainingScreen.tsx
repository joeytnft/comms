import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTrainingStore } from '@/store/useTrainingStore';
import { useGroupStore } from '@/store/useGroupStore';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';
import { TrainingStackParamList } from '@/navigation/TrainingStackNavigator';

type Nav = NativeStackNavigationProp<TrainingStackParamList>;
type RouteT = RouteProp<TrainingStackParamList, 'CreateTraining'>;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ── Inline calendar modal ────────────────────────────────────────────────────

function CalendarPicker({
  visible,
  value,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  value: string; // 'YYYY-MM-DD' or ''
  onConfirm: (date: string) => void;
  onCancel: () => void;
}) {
  const today = new Date();
  const initYear = value ? parseInt(value.slice(0, 4), 10) : today.getFullYear();
  const initMonth = value ? parseInt(value.slice(5, 7), 10) - 1 : today.getMonth();
  const initDay = value ? parseInt(value.slice(8, 10), 10) : today.getDate();

  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const [selDay, setSelDay] = useState(initDay);

  useEffect(() => {
    if (visible) {
      const y = value ? parseInt(value.slice(0, 4), 10) : today.getFullYear();
      const m = value ? parseInt(value.slice(5, 7), 10) - 1 : today.getMonth();
      const d = value ? parseInt(value.slice(8, 10), 10) : today.getDate();
      setViewYear(y);
      setViewMonth(m);
      setSelDay(d);
    }
  }, [visible]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();

  const cells = useMemo(() => {
    const arr: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelDay(1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelDay(1);
  };

  const handleConfirm = () => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(selDay).padStart(2, '0');
    onConfirm(`${viewYear}-${mm}-${dd}`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={cal.overlay} onPress={onCancel}>
        <Pressable style={cal.card} onPress={e => e.stopPropagation()}>
          {/* Header */}
          <View style={cal.header}>
            <TouchableOpacity onPress={prevMonth} style={cal.navBtn}>
              <Text style={cal.navText}>‹</Text>
            </TouchableOpacity>
            <Text style={cal.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={cal.navBtn}>
              <Text style={cal.navText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day-of-week labels */}
          <View style={cal.weekRow}>
            {DAY_LABELS.map(l => (
              <Text key={l} style={cal.dowLabel}>{l}</Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={cal.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={cal.cell} />;
              const selected = day === selDay;
              return (
                <TouchableOpacity
                  key={i}
                  style={[cal.cell, selected && cal.cellSelected]}
                  onPress={() => setSelDay(day)}
                >
                  <Text style={[cal.cellText, selected && cal.cellTextSelected]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Actions */}
          <View style={cal.actions}>
            <TouchableOpacity style={cal.cancelBtn} onPress={onCancel}>
              <Text style={cal.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cal.confirmBtn} onPress={handleConfirm}>
              <Text style={cal.confirmText}>Select</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Form field wrapper ───────────────────────────────────────────────────────

function FormField({ label, children, optional }: { label: string; children: React.ReactNode; optional?: boolean }) {
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

// ── Screen ───────────────────────────────────────────────────────────────────

export function CreateTrainingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const isEdit = !!route.params?.trainingId;

  const { currentTraining, createTraining, updateTraining, fetchTraining } = useTrainingStore();
  const { groups, fetchGroups } = useGroupStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState(''); // 'YYYY-MM-DD'
  const [startHour, setStartHour] = useState('');
  const [startMin, setStartMin] = useState('');
  const [endHour, setEndHour] = useState('');
  const [endMin, setEndMin] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchGroups();
    if (isEdit && route.params.trainingId) {
      fetchTraining(route.params.trainingId);
    }
  }, []);

  useEffect(() => {
    if (isEdit && currentTraining && currentTraining.id === route.params?.trainingId) {
      setTitle(currentTraining.title);
      setDescription(currentTraining.description ?? '');
      setLocation(currentTraining.location ?? '');
      const s = new Date(currentTraining.startDate);
      setStartDate(s.toISOString().split('T')[0]);
      setStartHour(String(s.getHours()).padStart(2, '0'));
      setStartMin(String(s.getMinutes()).padStart(2, '0'));
      if (currentTraining.endDate) {
        const e = new Date(currentTraining.endDate);
        setEndHour(String(e.getHours()).padStart(2, '0'));
        setEndMin(String(e.getMinutes()).padStart(2, '0'));
      }
      setMaxAttendees(currentTraining.maxAttendees?.toString() ?? '');
      setSelectedGroupIds(currentTraining.groupTargets.map(t => t.groupId));
    }
  }, [currentTraining?.id]);

  const buildDateTime = (date: string, hour: string, min: string): string => {
    const h = parseInt(hour || '0', 10);
    const m = parseInt(min || '0', 10);
    return new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
  };

  const clamp = (val: string, max: number): string => {
    const n = parseInt(val, 10);
    if (isNaN(n)) return val;
    return String(Math.min(n, max));
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Validation', 'Title is required'); return; }
    if (!startDate) { Alert.alert('Validation', 'Start date is required'); return; }
    const h = parseInt(startHour || '0', 10);
    const m = parseInt(startMin || '0', 10);
    if (h < 0 || h > 23) { Alert.alert('Validation', 'Start hour must be 0–23'); return; }
    if (m < 0 || m > 59) { Alert.alert('Validation', 'Start minute must be 0–59'); return; }

    setIsSaving(true);
    try {
      const hasEnd = endHour !== '' || endMin !== '';
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startDate: buildDateTime(startDate, startHour, startMin),
        endDate: hasEnd ? buildDateTime(startDate, endHour, endMin) : undefined,
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
    setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const selectedGroupNames = groups.filter(g => selectedGroupIds.includes(g.id)).map(g => g.name).join(', ');

  const displayDate = startDate
    ? new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Tap to select date';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEdit ? 'Edit Training' : 'New Training'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSaving} style={styles.saveBtn}>
            {isSaving ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Text style={styles.saveText}>Save</Text>}
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

          {/* Date picker */}
          <FormField label="Date">
            <TouchableOpacity
              style={[styles.input, styles.dateButton]}
              onPress={() => setShowCalendar(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dateButtonText, !startDate && { color: COLORS.textSecondary }]}>
                {displayDate}
              </Text>
              <Text style={styles.calendarIcon}>📅</Text>
            </TouchableOpacity>
          </FormField>

          {/* Time fields */}
          <View style={styles.timeRow}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Start Time</Text>
              <View style={styles.timeInputs}>
                <TextInput
                  style={[styles.input, styles.timeHalf]}
                  value={startHour}
                  onChangeText={v => setStartHour(clamp(v.replace(/\D/g, ''), 23))}
                  placeholder="HH"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={styles.timeSep}>:</Text>
                <TextInput
                  style={[styles.input, styles.timeHalf]}
                  value={startMin}
                  onChangeText={v => setStartMin(clamp(v.replace(/\D/g, ''), 59))}
                  placeholder="MM"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>
                End Time <Text style={styles.optional}>(optional)</Text>
              </Text>
              <View style={styles.timeInputs}>
                <TextInput
                  style={[styles.input, styles.timeHalf]}
                  value={endHour}
                  onChangeText={v => setEndHour(clamp(v.replace(/\D/g, ''), 23))}
                  placeholder="HH"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={styles.timeSep}>:</Text>
                <TextInput
                  style={[styles.input, styles.timeHalf]}
                  value={endMin}
                  onChangeText={v => setEndMin(clamp(v.replace(/\D/g, ''), 59))}
                  placeholder="MM"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
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
                style={[styles.selectText, !selectedGroupNames && { color: COLORS.textSecondary }]}
                numberOfLines={1}
              >
                {selectedGroupNames || 'All teams (no restriction)'}
              </Text>
            </TouchableOpacity>
          </FormField>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Calendar picker */}
      <CalendarPicker
        visible={showCalendar}
        value={startDate}
        onConfirm={date => { setStartDate(date); setShowCalendar(false); }}
        onCancel={() => setShowCalendar(false)}
      />

      {/* Group picker modal */}
      <Modal visible={showGroupPicker} transparent animationType="slide">
        <Pressable style={styles.pickerOverlay} onPress={() => setShowGroupPicker(false)}>
          <Pressable style={styles.pickerCard} onPress={e => e.stopPropagation()}>
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
              keyExtractor={g => g.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerRow} onPress={() => toggleGroup(item.id)}>
                  <View style={[styles.checkbox, selectedGroupIds.includes(item.id) && styles.checkboxChecked]}>
                    {selectedGroupIds.includes(item.id) && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={[styles.groupDot, { backgroundColor: item.iconColor ?? COLORS.primary }]} />
                  <Text style={styles.pickerRowText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Calendar styles ──────────────────────────────────────────────────────────

const cal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    width: '100%',
    maxWidth: 340,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  navBtn: { padding: SPACING.sm },
  navText: { fontSize: 24, color: COLORS.primary, lineHeight: 28 },
  monthLabel: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.textPrimary },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dowLabel: {
    flex: 1,
    textAlign: 'center',
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
  },
  cellSelected: { backgroundColor: COLORS.primary },
  cellText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textPrimary },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  cancelText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  confirmBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  confirmText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '700' },
});

// ── Screen styles ────────────────────────────────────────────────────────────

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
  form: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.xl },
  field: { gap: 6 },
  timeRow: { flexDirection: 'row', gap: SPACING.sm },
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
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonText: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, flex: 1 },
  calendarIcon: { fontSize: 18 },
  timeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeHalf: { flex: 1, textAlign: 'center' },
  timeSep: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '700' },
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
