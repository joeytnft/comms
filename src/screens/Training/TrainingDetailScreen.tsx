import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTrainingStore } from '@/store/useTrainingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { TrainingSignup } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { TrainingStackParamList } from '@/navigation/TrainingStackNavigator';

type Nav = NativeStackNavigationProp<TrainingStackParamList>;
type RouteT = RouteProp<TrainingStackParamList, 'TrainingDetail'>;

function Avatar({ name, url }: { name: string; url: string | null }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function TrainingDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { trainingId } = route.params;

  const { currentTraining, signups, isLoading, fetchTraining, fetchSignups, signUp, cancelSignup, deleteTraining, clearCurrentTraining } =
    useTrainingStore();
  const { user } = useAuthStore();

  const [showSignupModal, setShowSignupModal] = useState(false);
  const [signupNotes, setSignupNotes] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [showAdminSignups, setShowAdminSignups] = useState(false);

  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  useFocusEffect(
    useCallback(() => {
      fetchTraining(trainingId);
      if (isAdmin) fetchSignups(trainingId);
      return () => clearCurrentTraining();
    }, [trainingId, isAdmin]),
  );

  const handleSignup = async () => {
    setIsActing(true);
    try {
      await signUp(trainingId, signupNotes.trim() || undefined);
      setShowSignupModal(false);
      setSignupNotes('');
      fetchTraining(trainingId);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to sign up');
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel Signup', 'Are you sure you want to cancel your registration?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setIsActing(true);
          try {
            await cancelSignup(trainingId);
            fetchTraining(trainingId);
          } catch {
            Alert.alert('Error', 'Failed to cancel signup');
          } finally {
            setIsActing(false);
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete Training', 'This will permanently delete this training event. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTraining(trainingId);
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Failed to delete training');
          }
        },
      },
    ]);
  };

  const handleShowSignups = async () => {
    if (signups.length === 0) await fetchSignups(trainingId);
    setShowAdminSignups(true);
  };

  if (isLoading && !currentTraining) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      </SafeAreaView>
    );
  }

  const training = currentTraining;
  if (!training) return null;

  const start = new Date(training.startDate);
  const end = training.endDate ? new Date(training.endDate) : null;
  const mySignup = training.mySignup;
  const isSignedUp = mySignup && mySignup.status !== 'CANCELLED';
  const isFull =
    training.maxAttendees !== null &&
    (training.confirmedCount ?? 0) >= training.maxAttendees;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>
        {isAdmin && (
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('CreateTraining', { trainingId: training.id })}
              style={styles.editBtn}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{training.title}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaIcon}>📅</Text>
          <Text style={styles.metaText}>
            {start.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaIcon}>🕐</Text>
          <Text style={styles.metaText}>
            {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {end
              ? ` – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
              : ''}
          </Text>
        </View>

        {training.location ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>📍</Text>
            <Text style={styles.metaText}>{training.location}</Text>
          </View>
        ) : null}

        {training.groupTargets.length > 0 && (
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>👥</Text>
            <Text style={styles.metaText}>
              {training.groupTargets.map((t) => t.group.name).join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaIcon}>🪑</Text>
          <Text style={styles.metaText}>
            {training.confirmedCount ?? 0}
            {training.maxAttendees ? ` / ${training.maxAttendees} spots filled` : ' registered'}
          </Text>
        </View>

        {training.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.description}>{training.description}</Text>
          </View>
        ) : null}

        {/* My Signup Status */}
        {isSignedUp && (
          <View
            style={[
              styles.signupBanner,
              mySignup!.status === 'WAITLISTED' && styles.signupBannerWait,
            ]}
          >
            <Text style={styles.signupBannerText}>
              {mySignup!.status === 'CONFIRMED'
                ? 'You are registered for this event'
                : 'You are on the waitlist'}
            </Text>
          </View>
        )}

        {/* Signup / Cancel button */}
        {!isSignedUp ? (
          <TouchableOpacity
            style={[styles.primaryBtn, isFull && styles.primaryBtnAlt]}
            onPress={() => setShowSignupModal(true)}
            disabled={isActing}
          >
            {isActing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {isFull ? 'Join Waitlist' : 'Sign Up'}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={isActing}
          >
            {isActing ? (
              <ActivityIndicator color={COLORS.error} />
            ) : (
              <Text style={styles.cancelBtnText}>Cancel Registration</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Admin: show signups list */}
        {isAdmin && (
          <TouchableOpacity style={styles.adminBtn} onPress={handleShowSignups}>
            <Text style={styles.adminBtnText}>View All Signups ({training.confirmedCount ?? 0})</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Signup modal */}
      <Modal visible={showSignupModal} transparent animationType="slide" onRequestClose={() => setShowSignupModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSignupModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Sign Up for Training</Text>
              <Text style={styles.modalSubtitle}>{training.title}</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Notes (optional)"
                placeholderTextColor={COLORS.textSecondary}
                value={signupNotes}
                onChangeText={setSignupNotes}
                multiline
                numberOfLines={3}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setShowSignupModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={handleSignup}
                  disabled={isActing}
                >
                  {isActing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Confirm Signup</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Admin signups modal */}
      <Modal visible={showAdminSignups} transparent animationType="slide" onRequestClose={() => setShowAdminSignups(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAdminSignups(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[styles.modalCard, { maxHeight: '70%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Registrations</Text>
              <TouchableOpacity onPress={() => setShowAdminSignups(false)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {signups.filter((s) => s.status !== 'CANCELLED').map((s) => (
                <View key={s.id} style={styles.signupRow}>
                  <Avatar name={s.user?.displayName ?? '?'} url={s.user?.avatarUrl ?? null} />
                  <View style={styles.signupInfo}>
                    <Text style={styles.signupName}>{s.user?.displayName}</Text>
                    <Text style={styles.signupMeta}>
                      {new Date(s.signedUpAt).toLocaleDateString()}
                      {s.status === 'WAITLISTED' ? '  •  Waitlisted' : ''}
                    </Text>
                    {s.notes ? <Text style={styles.signupNotes}>{s.notes}</Text> : null}
                  </View>
                </View>
              ))}
              {signups.filter((s) => s.status !== 'CANCELLED').length === 0 && (
                <Text style={styles.noSignups}>No registrations yet.</Text>
              )}
            </ScrollView>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
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
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { paddingVertical: SPACING.xs },
  backText: { ...TYPOGRAPHY.body, color: COLORS.primary },
  headerActions: { flexDirection: 'row', gap: SPACING.sm },
  editBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  editBtnText: { ...TYPOGRAPHY.body, color: COLORS.primary },
  deleteBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  deleteBtnText: { ...TYPOGRAPHY.body, color: COLORS.error },
  content: { padding: SPACING.md, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h1, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  metaIcon: { fontSize: 16, width: 22 },
  metaText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, flex: 1 },
  section: { marginTop: SPACING.md },
  sectionTitle: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  description: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, lineHeight: 22 },
  signupBanner: {
    backgroundColor: COLORS.success + '22',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  signupBannerWait: { backgroundColor: COLORS.warning + '22' },
  signupBannerText: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  primaryBtnAlt: { backgroundColor: COLORS.warning },
  primaryBtnText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '700' },
  cancelBtn: {
    backgroundColor: COLORS.error + '22',
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  cancelBtnText: { ...TYPOGRAPHY.body, color: COLORS.error, fontWeight: '700' },
  adminBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  adminBtnText: { ...TYPOGRAPHY.body, color: COLORS.primary },
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
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary },
  modalSubtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: SPACING.md },
  modalCloseText: { ...TYPOGRAPHY.body, color: COLORS.primary },
  notesInput: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  modalActions: { flexDirection: 'row', gap: SPACING.sm },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.gray600,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  modalCancelText: { ...TYPOGRAPHY.body, color: COLORS.textPrimary },
  modalConfirmBtn: {
    flex: 2,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  modalConfirmText: { ...TYPOGRAPHY.body, color: '#fff', fontWeight: '700' },
  signupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.primary },
  signupInfo: { flex: 1 },
  signupName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  signupMeta: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  signupNotes: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 2 },
  noSignups: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: SPACING.lg },
});
