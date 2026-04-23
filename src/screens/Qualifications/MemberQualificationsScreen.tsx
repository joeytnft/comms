import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQualificationStore } from '@/store/useQualificationStore';
import { useAuthStore } from '@/store/useAuthStore';
import { MemberQualification, isQualificationExpired, isQualificationExpiringSoon } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { TrainingStackParamList } from '@/navigation/TrainingStackNavigator';

type Nav = NativeStackNavigationProp<TrainingStackParamList>;
type RouteT = RouteProp<TrainingStackParamList, 'MemberQualifications'>;

function QualBadge({ qual }: { qual: MemberQualification }) {
  const expired = isQualificationExpired(qual);
  const expiringSoon = isQualificationExpiringSoon(qual);

  let badgeStyle = styles.badgeActive;
  let badgeText = 'Active';
  if (expired) {
    badgeStyle = styles.badgeExpired;
    badgeText = 'Expired';
  } else if (expiringSoon) {
    badgeStyle = styles.badgeExpiring;
    badgeText = 'Expiring Soon';
  }

  return (
    <View style={[styles.badge, badgeStyle]}>
      <Text style={styles.badgeText}>{badgeText}</Text>
    </View>
  );
}

function QualCard({
  qual,
  onEdit,
  onRevoke,
  isAdmin,
}: {
  qual: MemberQualification;
  onEdit: () => void;
  onRevoke: () => void;
  isAdmin: boolean;
}) {
  const earned = new Date(qual.earnedDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const expires = qual.expiresAt
    ? new Date(qual.expiresAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <View style={styles.qualCard}>
      <View style={styles.qualHeader}>
        <Text style={styles.qualName}>{qual.qualificationType.name}</Text>
        <QualBadge qual={qual} />
      </View>
      {qual.qualificationType.description ? (
        <Text style={styles.qualDesc}>{qual.qualificationType.description}</Text>
      ) : null}
      <Text style={styles.qualMeta}>
        Earned: {earned}
        {expires ? `  •  Expires: ${expires}` : '  •  Never expires'}
      </Text>
      {qual.notes ? <Text style={styles.qualNotes}>{qual.notes}</Text> : null}
      {isAdmin && (
        <View style={styles.qualActions}>
          <TouchableOpacity onPress={onEdit}>
            <Text style={styles.qualEdit}>Edit Date</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRevoke}>
            <Text style={styles.qualRevoke}>Revoke</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export function MemberQualificationsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { userId, memberName } = route.params;

  const { qualificationTypes, memberQualifications, isLoadingTypes, isLoadingMember, fetchActiveTypes, fetchMemberQualifications, awardQualification, revokeQualification } =
    useQualificationStore();
  const { user } = useAuthStore();

  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const isSelf = user?.id === userId;

  const [showAwardModal, setShowAwardModal] = useState(false);
  const [editingQual, setEditingQual] = useState<MemberQualification | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [earnedDate, setEarnedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchActiveTypes();
      fetchMemberQualifications(userId);
    }, [userId]),
  );

  const qualifications = memberQualifications[userId] ?? [];

  const openAward = useCallback(() => {
    setEditingQual(null);
    setSelectedTypeId('');
    setEarnedDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    fetchActiveTypes(); // Always refresh so reactivated types appear immediately
    setShowAwardModal(true);
  }, [fetchActiveTypes]);

  const openEdit = (qual: MemberQualification) => {
    setEditingQual(qual);
    setSelectedTypeId(qual.qualificationTypeId);
    setEarnedDate(qual.earnedDate.split('T')[0]);
    setNotes(qual.notes ?? '');
    setShowAwardModal(true);
  };

  const handleSave = async () => {
    if (!selectedTypeId) {
      Alert.alert('Validation', 'Please select a qualification type');
      return;
    }
    if (!earnedDate) {
      Alert.alert('Validation', 'Earned date is required');
      return;
    }

    setIsSaving(true);
    try {
      await awardQualification(userId, {
        qualificationTypeId: selectedTypeId,
        earnedDate,
        notes: notes.trim() || undefined,
      });
      setShowAwardModal(false);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save qualification');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevoke = (qual: MemberQualification) => {
    Alert.alert(
      'Revoke Qualification',
      `Remove "${qual.qualificationType.name}" from this member?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeQualification(userId, qual.qualificationTypeId);
            } catch {
              Alert.alert('Error', 'Failed to revoke qualification');
            }
          },
        },
      ],
    );
  };

  const selectedTypeName =
    qualificationTypes.find((t) => t.id === selectedTypeId)?.name ?? 'Select type...';

  // Unearned qualification types (for the award form type picker)
  const earnedTypeIds = new Set(qualifications.map((q) => q.qualificationTypeId));
  const unearnedTypes = qualificationTypes.filter(
    (t) => t.isActive && (!earnedTypeIds.has(t.id) || editingQual?.qualificationTypeId === t.id),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {memberName ?? 'Qualifications'}
        </Text>
        {isAdmin && (
          <TouchableOpacity style={styles.addBtn} onPress={openAward}>
            <Text style={styles.addBtnText}>+ Award</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoadingMember && qualifications.length === 0 ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : qualifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {isSelf ? 'You have no qualifications yet.' : 'No qualifications on record.'}
          </Text>
          {isAdmin && (
            <TouchableOpacity style={styles.emptyBtn} onPress={openAward}>
              <Text style={styles.emptyBtnText}>Award First Qualification</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {/* Summary counts */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryNum}>{qualifications.filter((q) => !isQualificationExpired(q)).length}</Text>
              <Text style={styles.summaryLabel}>Active</Text>
            </View>
            <View style={[styles.summaryChip, styles.summaryChipWarn]}>
              <Text style={styles.summaryNum}>{qualifications.filter(isQualificationExpiringSoon).length}</Text>
              <Text style={styles.summaryLabel}>Expiring Soon</Text>
            </View>
            <View style={[styles.summaryChip, styles.summaryChipErr]}>
              <Text style={styles.summaryNum}>{qualifications.filter(isQualificationExpired).length}</Text>
              <Text style={styles.summaryLabel}>Expired</Text>
            </View>
          </View>

          {qualifications.map((qual) => (
            <QualCard
              key={qual.id}
              qual={qual}
              isAdmin={isAdmin}
              onEdit={() => openEdit(qual)}
              onRevoke={() => handleRevoke(qual)}
            />
          ))}
        </ScrollView>
      )}

      {/* Award/Edit qualification modal */}
      <Modal visible={showAwardModal} transparent animationType="slide" onRequestClose={() => setShowAwardModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowAwardModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editingQual ? 'Update Qualification' : 'Award Qualification'}
              </Text>

              {!editingQual && (
                <>
                  <Text style={styles.fieldLabel}>Qualification Type *</Text>
                  <TouchableOpacity
                    style={styles.selectBtn}
                    onPress={() => setShowTypePicker(true)}
                  >
                    <Text
                      style={[
                        styles.selectText,
                        !selectedTypeId && { color: COLORS.textSecondary },
                      ]}
                    >
                      {selectedTypeName}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              {editingQual && (
                <Text style={styles.editingQualName}>{editingQual.qualificationType.name}</Text>
              )}

              <Text style={styles.fieldLabel}>Date Earned *</Text>
              <TextInput
                style={styles.input}
                value={earnedDate}
                onChangeText={setEarnedDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Certification number, instructor, location..."
                placeholderTextColor={COLORS.textSecondary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setShowAwardModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Type picker modal */}
      <Modal visible={showTypePicker} transparent animationType="slide" onRequestClose={() => setShowTypePicker(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowTypePicker(false)} />
          <View style={[styles.modalCard, styles.pickerCard]}>
            <View style={styles.pickerHeader}>
              <Text style={styles.modalTitle}>Select Qualification</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            {isLoadingTypes && qualificationTypes.length === 0 ? (
              <ActivityIndicator color={COLORS.primary} style={{ margin: SPACING.lg }} />
            ) : (
              <FlatList
                data={unearnedTypes}
                keyExtractor={(t) => t.id}
                keyboardShouldPersistTaps="handled"
                style={styles.pickerList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.typeRow}
                    onPress={() => {
                      setSelectedTypeId(item.id);
                      setShowTypePicker(false);
                    }}
                  >
                    <View style={styles.typeInfo}>
                      <Text style={styles.typeName}>{item.name}</Text>
                      {item.description ? (
                        <Text style={styles.typeDesc}>{item.description}</Text>
                      ) : null}
                      <Text style={styles.typeValidity}>
                        {item.validityDays > 0
                          ? `Valid for ${item.validityDays} days`
                          : 'Never expires'}
                      </Text>
                    </View>
                    {selectedTypeId === item.id && (
                      <Text style={styles.typeCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.noTypes}>
                    {qualificationTypes.length === 0
                      ? 'No qualification types have been created yet. Add them via Training → Qualification Types.'
                      : 'All qualification types are already awarded to this member.'}
                  </Text>
                }
              />
            )}
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  backBtn: { minWidth: 48 },
  backText: { ...TYPOGRAPHY.body, color: COLORS.info },
  headerTitle: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary, flex: 1 },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  addBtnText: { ...TYPOGRAPHY.caption, color: '#fff', fontWeight: '700' },
  list: { padding: SPACING.md, gap: SPACING.sm },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  summaryChip: {
    flex: 1,
    backgroundColor: COLORS.success + '18',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  summaryChipWarn: { backgroundColor: COLORS.warning + '18' },
  summaryChipErr: { backgroundColor: COLORS.error + '18' },
  summaryNum: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary },
  summaryLabel: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  qualCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  qualHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  qualName: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  badge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.xs,
    marginLeft: SPACING.xs,
  },
  badgeActive: { backgroundColor: COLORS.success + '22' },
  badgeExpiring: { backgroundColor: COLORS.warning + '22' },
  badgeExpired: { backgroundColor: COLORS.error + '22' },
  badgeText: { fontSize: 11, fontWeight: '600', color: COLORS.textPrimary },
  qualDesc: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginBottom: 4 },
  qualMeta: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  qualNotes: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 4 },
  qualActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  qualEdit: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '600' },
  qualRevoke: { ...TYPOGRAPHY.caption, color: COLORS.error },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  emptyBtnText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  pickerCard: {
    maxHeight: SCREEN_HEIGHT * 0.6,
    gap: 0,
  },
  pickerList: {
    flexGrow: 0,
  },
  modalTitle: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  editingQualName: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.xs },
  fieldLabel: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  selectBtn: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
  },
  selectText: { ...TYPOGRAPHY.body, color: COLORS.textPrimary },
  modalActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  modalCancelText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  modalSaveText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '700' },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  pickerDone: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '700' },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  typeInfo: { flex: 1 },
  typeName: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary },
  typeDesc: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  typeValidity: { ...TYPOGRAPHY.caption, color: COLORS.info },
  typeCheck: { fontSize: 18, color: COLORS.primary, fontWeight: '700' },
  noTypes: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center', padding: SPACING.lg },
});
