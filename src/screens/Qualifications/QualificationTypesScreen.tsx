import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Switch,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useQualificationStore } from '@/store/useQualificationStore';
import { QualificationType } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

type FormState = {
  name: string;
  description: string;
  validityDays: string;
};

const EMPTY_FORM: FormState = { name: '', description: '', validityDays: '' };

export function QualificationTypesScreen() {
  const { qualificationTypes, isLoading, fetchTypes, createType, updateType, deleteType } =
    useQualificationStore();

  const [editTarget, setEditTarget] = useState<QualificationType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [modalVisible, setModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchTypes();
    }, []),
  );

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (qt: QualificationType) => {
    setEditTarget(qt);
    setForm({
      name: qt.name,
      description: qt.description ?? '',
      validityDays: qt.validityDays > 0 ? qt.validityDays.toString() : '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Name is required');
      return;
    }
    const days = form.validityDays ? parseInt(form.validityDays, 10) : 0;
    if (isNaN(days) || days < 0) {
      Alert.alert('Validation', 'Validity days must be a positive number or blank (never expires)');
      return;
    }

    setIsSaving(true);
    try {
      if (editTarget) {
        await updateType(editTarget.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          validityDays: days,
        });
      } else {
        await createType({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          validityDays: days,
        });
      }
      setModalVisible(false);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (qt: QualificationType) => {
    Alert.alert(
      'Remove Qualification',
      `Remove "${qt.name}"? Existing member records will be preserved but no new qualifications of this type can be awarded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteType(qt.id);
            } catch {
              Alert.alert('Error', 'Failed to remove qualification type');
            }
          },
        },
      ],
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTypes();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Qualification Types</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {qualificationTypes.length === 0 && !isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No qualification types yet</Text>
          <Text style={styles.emptySubtitle}>
            Add certification types like CPR, Firearm Qualification, or Stop the Bleed.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={openCreate}>
            <Text style={styles.emptyBtnText}>Add First Type</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={qualificationTypes}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.cardDesc}>{item.description}</Text>
                ) : null}
                <Text style={styles.cardValidity}>
                  {item.validityDays > 0
                    ? `Expires after ${item.validityDays} days (${Math.round(item.validityDays / 365 * 10) / 10} yr)`
                    : 'Never expires'}
                </Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
                  <Text style={styles.actionEdit}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
                  <Text style={styles.actionDelete}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: SPACING.xs }} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editTarget ? 'Edit Qualification Type' : 'New Qualification Type'}
              </Text>

              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. CPR Certified"
                placeholderTextColor={COLORS.textSecondary}
              />

              <Text style={[styles.fieldLabel, { marginTop: SPACING.xs }]}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Brief description of this certification"
                placeholderTextColor={COLORS.textSecondary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={[styles.fieldLabel, { marginTop: SPACING.xs }]}>Validity Period (days)</Text>
              <TextInput
                style={styles.input}
                value={form.validityDays}
                onChangeText={(v) => setForm((f) => ({ ...f, validityDays: v }))}
                placeholder="Leave blank = never expires  (e.g. 730 = 2 years)"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="number-pad"
              />
              <Text style={styles.hint}>Common: 365 (1 yr), 730 (2 yr), 1095 (3 yr)</Text>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setModalVisible(false)}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  addBtnText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '600' },
  list: { padding: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  cardLeft: { flex: 1 },
  cardName: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary },
  cardDesc: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 2 },
  cardValidity: { ...TYPOGRAPHY.caption, color: COLORS.primary, marginTop: 4 },
  cardActions: { alignItems: 'flex-end', gap: SPACING.xs },
  actionBtn: { paddingVertical: 2 },
  actionEdit: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '600' },
  actionDelete: { ...TYPOGRAPHY.caption, color: COLORS.error },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyTitle: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary, textAlign: 'center' },
  emptySubtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.sm,
  },
  emptyBtnText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    maxHeight: '85%',
  },
  modalTitle: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary, marginBottom: SPACING.sm },
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
  hint: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
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
});
