import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useResponsePlanStore, ResponsePlan, ResponsePlanStep } from '@/store/useResponsePlanStore';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

export function ResponsePlansScreen() {
  const { plans, isLoading, fetchPlans, createPlan, updatePlan, deletePlan } =
    useResponsePlanStore();

  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ResponsePlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [steps, setSteps] = useState<{ action: string; assignedTo: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchPlans();
    }, []),
  );

  const openCreate = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanDesc('');
    setSteps([{ action: '', assignedTo: '' }]);
    setShowModal(true);
  };

  const openEdit = (plan: ResponsePlan) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanDesc(plan.description ?? '');
    setSteps(plan.steps.map((s) => ({ action: s.action, assignedTo: s.assignedTo ?? '' })));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!planName.trim()) {
      Alert.alert('Error', 'Plan name is required');
      return;
    }
    const validSteps = steps.filter((s) => s.action.trim());
    setSaving(true);
    try {
      const stepsPayload = validSteps.map((s, i) => ({
        order: i,
        action: s.action.trim(),
        assignedTo: s.assignedTo.trim() || undefined,
      }));
      if (editingPlan) {
        await updatePlan(editingPlan.id, {
          name: planName.trim(),
          description: planDesc.trim() || undefined,
          steps: stepsPayload,
        });
      } else {
        await createPlan({
          name: planName.trim(),
          description: planDesc.trim() || undefined,
          steps: stepsPayload,
        });
      }
      setShowModal(false);
    } catch {
      Alert.alert('Error', 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (plan: ResponsePlan) => {
    Alert.alert('Delete Plan', `Delete "${plan.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlan(plan.id);
          } catch {
            Alert.alert('Error', 'Failed to delete plan');
          }
        },
      },
    ]);
  };

  const addStep = () => setSteps((s) => [...s, { action: '', assignedTo: '' }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));
  const updateStepField = (
    i: number,
    field: 'action' | 'assignedTo',
    value: string,
  ) => {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, [field]: value } : step)));
  };

  const renderStep = (step: ResponsePlanStep, index: number) => (
    <View key={step.id} style={styles.stepRow}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{index + 1}</Text>
      </View>
      <View style={styles.stepContent}>
        <Text style={styles.stepAction}>{step.action}</Text>
        {step.assignedTo ? (
          <Text style={styles.stepAssigned}>→ {step.assignedTo}</Text>
        ) : null}
      </View>
    </View>
  );

  const renderPlan = ({ item }: { item: ResponsePlan }) => (
    <View style={styles.planCard}>
      <View style={styles.planHeader}>
        <View style={styles.planHeaderLeft}>
          <Text style={styles.planName}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.planDesc}>{item.description}</Text>
          ) : null}
        </View>
        <View style={styles.planActions}>
          <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
      {item.steps.length > 0 && (
        <View style={styles.stepsContainer}>
          {item.steps.map((step, i) => renderStep(step, i))}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Response Plans</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnText}>+ New Plan</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={plans}
        renderItem={renderPlan}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={fetchPlans} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No response plans yet</Text>
            <Text style={styles.emptyBody}>
              Create pre-configured action plans your team can execute during incidents.
            </Text>
          </View>
        }
      />

      {/* Create / Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPlan ? 'Edit Plan' : 'New Response Plan'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.fieldLabel}>Plan Name *</Text>
              <TextInput
                style={styles.input}
                value={planName}
                onChangeText={setPlanName}
                placeholder="e.g. Medical Emergency"
                placeholderTextColor={COLORS.textMuted}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={planDesc}
                onChangeText={setPlanDesc}
                placeholder="Brief description of this plan"
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
              />

              <Text style={styles.fieldLabel}>Action Steps</Text>
              {steps.map((step, i) => (
                <View key={i} style={styles.stepEditRow}>
                  <View style={styles.stepEditNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <View style={styles.stepEditFields}>
                    <TextInput
                      style={styles.input}
                      value={step.action}
                      onChangeText={(v) => updateStepField(i, 'action', v)}
                      placeholder="Action to take"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <TextInput
                      style={[styles.input, styles.inputSmall]}
                      value={step.assignedTo}
                      onChangeText={(v) => updateStepField(i, 'assignedTo', v)}
                      placeholder="Assigned role (optional)"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  {steps.length > 1 && (
                    <TouchableOpacity onPress={() => removeStep(i)} style={styles.removeStepBtn}>
                      <Text style={styles.removeStepText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity onPress={addStep} style={styles.addStepBtn}>
                <Text style={styles.addStepText}>+ Add Step</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Plan'}</Text>
              </TouchableOpacity>
            </View>
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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: { ...TYPOGRAPHY.heading1, color: COLORS.textPrimary },
  addBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  addBtnText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '600' },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  planCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planHeaderLeft: { flex: 1, marginRight: SPACING.sm },
  planName: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  planDesc: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, marginTop: 2 },
  planActions: { flexDirection: 'row', gap: SPACING.sm },
  editBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.info,
  },
  editBtnText: { ...TYPOGRAPHY.caption, color: COLORS.info, fontWeight: '600' },
  deleteBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  deleteBtnText: { ...TYPOGRAPHY.caption, color: COLORS.danger, fontWeight: '600' },
  stepsContainer: { marginTop: SPACING.md, gap: SPACING.sm },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '700' },
  stepContent: { flex: 1 },
  stepAction: { ...TYPOGRAPHY.body, color: COLORS.textPrimary },
  stepAssigned: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: SPACING.xl },
  emptyTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, textAlign: 'center' },
  emptyBody: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  modalTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  modalClose: { ...TYPOGRAPHY.heading3, color: COLORS.textMuted },
  modalBody: { padding: SPACING.lg, gap: SPACING.sm },
  modalFooter: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray700,
  },
  fieldLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginBottom: 4, marginTop: SPACING.sm },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
  },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  inputSmall: { marginTop: SPACING.xs },
  stepEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  stepEditNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  stepEditFields: { flex: 1 },
  removeStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.gray700,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  removeStepText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, fontWeight: '700' },
  addStepBtn: {
    alignSelf: 'flex-start',
    paddingVertical: SPACING.sm,
  },
  addStepText: { ...TYPOGRAPHY.body, color: COLORS.info, fontWeight: '600' },
  saveBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { ...TYPOGRAPHY.button, color: COLORS.white },
});
