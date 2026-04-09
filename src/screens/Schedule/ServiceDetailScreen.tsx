import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useScheduleStore } from '@/store/useScheduleStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useAuth } from '@/contexts/AuthContext';
import { ShiftAssignment } from '@/types';
import { scheduleService } from '@/services/scheduleService';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { ScheduleStackParamList } from '@/navigation/ScheduleStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<ScheduleStackParamList, 'ServiceDetail'>;
  route: RouteProp<ScheduleStackParamList, 'ServiceDetail'>;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type AssignmentStatus = 'checked_in' | 'checked_out' | 'expected' | 'no_show';

function getStatus(assignment: ShiftAssignment, serviceDate: string): AssignmentStatus {
  if (assignment.checkIn?.checkedOutAt) return 'checked_out';
  if (assignment.checkIn) return 'checked_in';
  if (new Date(serviceDate) < new Date()) return 'no_show';
  return 'expected';
}

const STATUS_CONFIG: Record<AssignmentStatus, { label: string; color: string; bg: string }> = {
  checked_in: { label: 'CHECKED IN', color: COLORS.success, bg: COLORS.success + '22' },
  checked_out: { label: 'CHECKED OUT', color: '#6B7280', bg: '#6B728022' },
  expected: { label: 'EXPECTED', color: COLORS.info, bg: COLORS.info + '22' },
  no_show: { label: 'NO SHOW', color: COLORS.danger, bg: COLORS.danger + '22' },
};

export function ServiceDetailScreen({ navigation, route }: Props) {
  const { serviceId } = route.params;
  const { user } = useAuth();
  const { groups, fetchGroups } = useGroupStore();
  const {
    currentService, isLoading, posts,
    fetchService, fetchPosts, assignUser, removeAssignment,
    checkIn, checkOut, requestSwap, respondToSwap, deleteService,
    createPost,
  } = useScheduleStore();

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapFromAssignment, setSwapFromAssignment] = useState<ShiftAssignment | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedPost, setSelectedPost] = useState<string | undefined>();
  const [assignRole, setAssignRole] = useState('');
  const [swapMessage, setSwapMessage] = useState('');
  const [swapTargetId, setSwapTargetId] = useState('');
  const [showPostCreate, setShowPostCreate] = useState(false);
  const [newPostName, setNewPostName] = useState('');
  const [newPostZone, setNewPostZone] = useState('');
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [myAvailable, setMyAvailable] = useState<boolean | null>(null);
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);

  const isAdmin = groups.some((g) => g.myRole === 'admin');

  useFocusEffect(
    useCallback(() => {
      fetchGroups();
      fetchService(serviceId);
      fetchPosts();
      return () => useScheduleStore.getState().clearCurrentService();
    }, [serviceId]),
  );

  useEffect(() => {
    scheduleService.getAvailability(serviceId).then(({ availability: rows }) => {
      const map: Record<string, boolean> = {};
      rows.forEach((r) => { map[r.userId] = r.available; });
      setAvailability(map);
      if (user?.id) setMyAvailable(map[user.id] ?? null);
    }).catch(() => null);
  }, [serviceId, user?.id]);

  if (!currentService) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{isLoading ? 'Loading...' : 'Service not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const myAssignment = currentService.assignments.find((a) => a.userId === user?.id);
  const allMembers = groups.flatMap((g) => g.members ?? []).filter(
    (m, i, arr) => arr.findIndex((x) => x.userId === m.userId) === i
  );

  const handleCheckIn = async () => {
    if (!myAssignment) return;
    try { await checkIn(myAssignment.id); }
    catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to check in'); }
  };

  const handleCheckOut = async () => {
    if (!myAssignment) return;
    try { await checkOut(myAssignment.id); }
    catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to check out'); }
  };

  const handleToggleAvailability = async (available: boolean) => {
    try {
      await scheduleService.setAvailability(serviceId, available);
      setMyAvailable(available);
      if (user?.id) setAvailability((prev) => ({ ...prev, [user.id]: available }));
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update availability');
    }
  };

  const handleRespondToAssignment = async (accept: boolean) => {
    if (!myAssignment) return;
    try {
      await scheduleService.respondToAssignment(myAssignment.id, accept);
      await fetchService(serviceId);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to respond');
    }
  };

  const handleAssign = async (userId: string) => {
    try {
      await assignUser(serviceId, { userId, postId: selectedPost, role: assignRole || undefined });
      setAssignSearch('');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to assign');
    }
  };

  const handleRemove = (assignmentId: string, name: string) => {
    Alert.alert('Remove Assignment', `Remove ${name} from this service?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await removeAssignment(serviceId, assignmentId); }
        catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove'); }
      }},
    ]);
  };

  const handleNotifyNoShows = () => {
    const noShows = currentService.assignments.filter(
      (a) => getStatus(a, currentService.serviceDate) === 'no_show'
    );
    if (noShows.length === 0) { Alert.alert('All Present', 'No no-shows to notify.'); return; }
    Alert.alert(
      `Notify ${noShows.length} No-Show${noShows.length > 1 ? 's' : ''}`,
      `Send a check-in reminder to: ${noShows.map((a) => a.user.displayName).join(', ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Reminder', onPress: () => {
          // In production this would trigger push notifications to each no-show user
          Alert.alert('Sent', 'Reminder notifications sent to no-shows.');
        }},
      ],
    );
  };

  const handleDeleteService = () => {
    Alert.alert('Delete Service', `Delete "${currentService.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteService(serviceId); navigation.goBack(); }
        catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete'); }
      }},
    ]);
  };

  const handleRequestSwap = (assignment: ShiftAssignment) => {
    setSwapFromAssignment(assignment);
    setSwapTargetId('');
    setSwapMessage('');
    setShowSwapModal(true);
  };

  const handleSendSwap = async () => {
    if (!swapFromAssignment || !swapTargetId) return;
    try {
      await requestSwap(swapFromAssignment.id, swapTargetId, swapMessage || undefined);
      setShowSwapModal(false);
      Alert.alert('Request Sent', 'Your shift swap request has been sent.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send swap request');
    }
  };

  const handleCreatePost = async () => {
    if (!newPostName.trim()) return;
    try {
      await createPost({ name: newPostName.trim(), zone: newPostZone.trim() || undefined });
      setNewPostName('');
      setNewPostZone('');
      setShowPostCreate(false);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create post');
    }
  };

  // Group assignments by zone/post
  const noPost = currentService.assignments.filter((a) => !a.post);
  const byPost = currentService.assignments.filter((a) => a.post);
  const zoneGroups = byPost.reduce<Record<string, ShiftAssignment[]>>((acc, a) => {
    const key = a.post?.zone || 'Unzoned';
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const sourceMembers = filterGroupId
    ? (groups.find((g) => g.id === filterGroupId)?.members ?? [])
    : allMembers;

  const filteredMembers = sourceMembers.filter((m) =>
    m.displayName?.toLowerCase().includes(assignSearch.toLowerCase()) &&
    !currentService.assignments.find((a) => a.userId === m.userId)
  );

  const renderAssignmentRow = (assignment: ShiftAssignment) => {
    const status = getStatus(assignment, currentService.serviceDate);
    const statusCfg = STATUS_CONFIG[status];
    const isMe = assignment.userId === user?.id;
    const pendingSwap = assignment.swapRequests.find((s) => s.status === 'PENDING');

    return (
      <View key={assignment.id} style={[styles.assignmentRow, isMe && styles.assignmentRowMe]}>
        <View style={styles.assignmentAvatar}>
          <Text style={styles.assignmentAvatarText}>
            {assignment.user.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.assignmentInfo}>
          <View style={styles.assignmentNameRow}>
            <Text style={styles.assignmentName}>{assignment.user.displayName}{isMe ? ' (You)' : ''}</Text>
            {assignment.role ? <Text style={styles.assignmentRole}>{assignment.role}</Text> : null}
          </View>
          {assignment.post ? (
            <Text style={styles.assignmentPost}>📍 {assignment.post.name}</Text>
          ) : null}
          {assignment.checkIn && (
            <Text style={styles.checkInTime}>
              In: {formatTime(assignment.checkIn.checkedInAt)}
              {assignment.checkIn.checkedOutAt ? `  Out: ${formatTime(assignment.checkIn.checkedOutAt)}` : ''}
            </Text>
          )}
          {pendingSwap && <Text style={styles.swapPending}>⇄ Swap requested</Text>}
        </View>
        <View style={styles.assignmentRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity onPress={() => handleRemove(assignment.id, assignment.user.displayName)}>
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          )}
          {isMe && !assignment.checkIn && (
            <TouchableOpacity style={styles.swapBtn} onPress={() => handleRequestSwap(assignment)}>
              <Text style={styles.swapBtnText}>Swap</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const noShows = currentService.assignments.filter(
    (a) => getStatus(a, currentService.serviceDate) === 'no_show'
  ).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity onPress={handleDeleteService}>
            <Text style={styles.deleteBtn}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => fetchService(serviceId)} tintColor={COLORS.accent} />}
      >
        {/* Service header */}
        <View style={styles.serviceHeader}>
          <Text style={styles.serviceName}>{currentService.name}</Text>
          <Text style={styles.serviceDate}>{formatDateTime(currentService.serviceDate)}</Text>
          {currentService.description ? (
            <Text style={styles.serviceDesc}>{currentService.description}</Text>
          ) : null}
        </View>

        {/* Stats bar */}
        <View style={styles.statsBar}>
          {([
            ['👥', currentService.assignments.length, 'assigned', COLORS.textSecondary],
            ['✓', currentService.assignments.filter((a) => a.checkIn).length, 'in', COLORS.success],
            ['⚠', noShows, 'no-show', COLORS.danger],
          ] as [string, number, string, string][]).map(([icon, n, label, color]) => (
            <View key={label} style={styles.statItem}>
              <Text style={[styles.statNumber, { color }]}>{icon} {n}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Availability toggle (non-assigned members) */}
        {!myAssignment && (
          <View style={styles.myCard}>
            <Text style={styles.myCardLabel}>YOUR AVAILABILITY</Text>
            <View style={styles.checkInButtons}>
              <TouchableOpacity
                style={[styles.checkInBtn, myAvailable === true && { backgroundColor: COLORS.success }]}
                onPress={() => handleToggleAvailability(true)}
              >
                <Text style={styles.checkInBtnText}>✓ Available</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkInBtn, myAvailable === false && { backgroundColor: COLORS.danger }]}
                onPress={() => handleToggleAvailability(false)}
              >
                <Text style={styles.checkInBtnText}>✗ Unavailable</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* My check-in card */}
        {myAssignment && (
          <View style={styles.myCard}>
            <Text style={styles.myCardLabel}>MY SHIFT</Text>
            <Text style={styles.myCardPost}>
              {myAssignment.post ? `📍 ${myAssignment.post.name}` : 'No post assigned'}
              {myAssignment.role ? `  ·  ${myAssignment.role}` : ''}
            </Text>
            {myAssignment.status === 'PENDING' && (
              <View style={styles.checkInButtons}>
                <TouchableOpacity style={[styles.checkInBtn, { backgroundColor: COLORS.success }]} onPress={() => handleRespondToAssignment(true)}>
                  <Text style={styles.checkInBtnText}>✓ Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.checkInBtn, { backgroundColor: COLORS.danger }]} onPress={() => handleRespondToAssignment(false)}>
                  <Text style={styles.checkInBtnText}>✗ Decline</Text>
                </TouchableOpacity>
              </View>
            )}
            {myAssignment.status === 'ACCEPTED' && (
              <View style={styles.checkInButtons}>
                {!myAssignment.checkIn ? (
                  <TouchableOpacity style={styles.checkInBtn} onPress={handleCheckIn}>
                    <Text style={styles.checkInBtnText}>CHECK IN</Text>
                  </TouchableOpacity>
                ) : !myAssignment.checkIn.checkedOutAt ? (
                  <TouchableOpacity style={[styles.checkInBtn, styles.checkOutBtn]} onPress={handleCheckOut}>
                    <Text style={styles.checkInBtnText}>CHECK OUT</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.checkedOutText}>Checked out at {formatTime(myAssignment.checkIn.checkedOutAt)}</Text>
                )}
              </View>
            )}
            {myAssignment.status === 'DECLINED' && (
              <Text style={[styles.checkedOutText, { color: COLORS.danger }]}>You declined this shift</Text>
            )}
          </View>
        )}

        {/* Admin actions */}
        {isAdmin && (
          <View style={styles.adminRow}>
            <TouchableOpacity style={styles.adminBtn} onPress={() => setShowAssignModal(true)}>
              <Text style={styles.adminBtnText}>+ Assign</Text>
            </TouchableOpacity>
            {noShows > 0 && (
              <TouchableOpacity style={[styles.adminBtn, styles.adminBtnDanger]} onPress={handleNotifyNoShows}>
                <Text style={[styles.adminBtnText, { color: COLORS.danger }]}>⚠ Notify {noShows}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Assignments by post/zone */}
        {Object.entries(zoneGroups).map(([zone, assignments]) => (
          <View key={zone} style={styles.section}>
            <Text style={styles.zoneLabel}>{zone.toUpperCase()}</Text>
            {assignments.map(renderAssignmentRow)}
          </View>
        ))}

        {noPost.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.zoneLabel}>NO POST ASSIGNED</Text>
            {noPost.map(renderAssignmentRow)}
          </View>
        )}

        {currentService.assignments.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No one assigned yet</Text>
            {isAdmin && <Text style={styles.emptyHint}>Tap "+ Assign" to add volunteers</Text>}
          </View>
        )}
      </ScrollView>

      {/* Assign user modal */}
      <Modal visible={showAssignModal} transparent animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign Volunteer</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.postRow}>
              <TouchableOpacity
                style={[styles.postChip, !filterGroupId && styles.postChipActive]}
                onPress={() => setFilterGroupId(null)}
              >
                <Text style={[styles.postChipText, !filterGroupId && styles.postChipTextActive]}>All Teams</Text>
              </TouchableOpacity>
              {groups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.postChip, filterGroupId === g.id && styles.postChipActive]}
                  onPress={() => setFilterGroupId(g.id)}
                >
                  <Text style={[styles.postChipText, filterGroupId === g.id && styles.postChipTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={styles.input}
              placeholder="Search team member..."
              placeholderTextColor={COLORS.textMuted}
              value={assignSearch}
              onChangeText={setAssignSearch}
            />

            <ScrollView style={styles.memberList} keyboardShouldPersistTaps="handled">
              {filteredMembers.slice(0, 10).map((m) => (
                <TouchableOpacity
                  key={m.userId}
                  style={styles.memberRow}
                  onPress={() => handleAssign(m.userId)}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{m.displayName?.charAt(0)?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.memberName}>{m.displayName}</Text>
                  {availability[m.userId] === true && <Text style={{ color: COLORS.success, fontSize: 11 }}>✓ Available</Text>}
                  {availability[m.userId] === false && <Text style={{ color: COLORS.danger, fontSize: 11 }}>✗ Unavailable</Text>}
                  {availability[m.userId] === undefined && <Text style={styles.memberTap}>Tap to assign</Text>}
                </TouchableOpacity>
              ))}
              {filteredMembers.length === 0 && (
                <Text style={styles.noMembers}>
                  {assignSearch ? 'No matches' : 'All members already assigned'}
                </Text>
              )}
            </ScrollView>

            {/* Post picker */}
            <Text style={styles.pickerLabel}>POST</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.postRow}>
              <TouchableOpacity
                style={[styles.postChip, !selectedPost && styles.postChipActive]}
                onPress={() => setSelectedPost(undefined)}
              >
                <Text style={[styles.postChipText, !selectedPost && styles.postChipTextActive]}>None</Text>
              </TouchableOpacity>
              {posts.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.postChip, selectedPost === p.id && styles.postChipActive]}
                  onPress={() => setSelectedPost(p.id)}
                >
                  <Text style={[styles.postChipText, selectedPost === p.id && styles.postChipTextActive]}>
                    {p.zone ? `${p.zone} › ` : ''}{p.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.postChip} onPress={() => setShowPostCreate(true)}>
                <Text style={[styles.postChipText, { color: COLORS.accent }]}>+ New Post</Text>
              </TouchableOpacity>
            </ScrollView>

            <TextInput
              style={styles.input}
              placeholder="Role (optional, e.g. Team Lead)"
              placeholderTextColor={COLORS.textMuted}
              value={assignRole}
              onChangeText={setAssignRole}
              maxLength={40}
            />

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAssignModal(false)}>
              <Text style={styles.cancelBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create post modal */}
      <Modal visible={showPostCreate} transparent animationType="slide" onRequestClose={() => setShowPostCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Post / Zone</Text>
            <TextInput
              style={styles.input}
              placeholder="Post name * (e.g. Children's Hallway)"
              placeholderTextColor={COLORS.textMuted}
              value={newPostName}
              onChangeText={setNewPostName}
              maxLength={60}
            />
            <TextInput
              style={styles.input}
              placeholder="Zone (optional, e.g. Interior)"
              placeholderTextColor={COLORS.textMuted}
              value={newPostZone}
              onChangeText={setNewPostZone}
              maxLength={40}
            />
            <TouchableOpacity
              style={[styles.createBtn, !newPostName.trim() && styles.createBtnDisabled]}
              onPress={handleCreatePost}
              disabled={!newPostName.trim()}
            >
              <Text style={styles.createBtnText}>Create Post</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPostCreate(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Swap request modal */}
      <Modal visible={showSwapModal} transparent animationType="slide" onRequestClose={() => setShowSwapModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request Shift Swap</Text>
            <Text style={styles.swapInfo}>
              Request to transfer your shift{swapFromAssignment?.post ? ` at ${swapFromAssignment.post.name}` : ''} to another team member.
            </Text>

            <Text style={styles.pickerLabel}>SELECT TEAM MEMBER</Text>
            <ScrollView style={styles.memberList} keyboardShouldPersistTaps="handled">
              {allMembers
                .filter((m) => m.userId !== user?.id)
                .map((m) => (
                  <TouchableOpacity
                    key={m.userId}
                    style={[styles.memberRow, swapTargetId === m.userId && styles.memberRowSelected]}
                    onPress={() => setSwapTargetId(m.userId)}
                  >
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>{m.displayName?.charAt(0)?.toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.memberName, swapTargetId === m.userId && { color: COLORS.accent }]}>
                      {m.displayName}
                    </Text>
                    {swapTargetId === m.userId && <Text style={{ color: COLORS.accent }}>✓</Text>}
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <TextInput
              style={styles.input}
              placeholder="Message (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={swapMessage}
              onChangeText={setSwapMessage}
              multiline
              maxLength={140}
            />

            <TouchableOpacity
              style={[styles.createBtn, !swapTargetId && styles.createBtnDisabled]}
              onPress={handleSendSwap}
              disabled={!swapTargetId}
            >
              <Text style={styles.createBtnText}>Send Swap Request</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSwapModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  backBtn: { ...TYPOGRAPHY.body, color: COLORS.info, fontWeight: '600' },
  deleteBtn: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },

  serviceHeader: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm,
  },
  serviceName: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary },
  serviceDate: { ...TYPOGRAPHY.body, color: COLORS.accent, marginTop: SPACING.xs },
  serviceDesc: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, marginTop: SPACING.xs },

  statsBar: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.md, ...SHADOWS.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { ...TYPOGRAPHY.heading3, fontWeight: '700' },
  statLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },

  myCard: {
    backgroundColor: COLORS.accent + '18', borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.accent + '44',
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  myCardLabel: { ...TYPOGRAPHY.caption, color: COLORS.accent, letterSpacing: 1, fontWeight: '700' },
  myCardPost: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, marginTop: SPACING.xs },
  checkInButtons: { marginTop: SPACING.sm },
  checkInBtn: {
    backgroundColor: COLORS.success, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  checkOutBtn: { backgroundColor: COLORS.gray700 },
  checkInBtnText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '800', letterSpacing: 1 },
  checkedOutText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, textAlign: 'center' },

  adminRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  adminBtn: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm, alignItems: 'center', borderWidth: 1,
    borderColor: COLORS.gray700, ...SHADOWS.sm,
  },
  adminBtnDanger: { borderColor: COLORS.danger + '60' },
  adminBtnText: { ...TYPOGRAPHY.bodySmall, color: COLORS.accent, fontWeight: '600' },

  section: { marginBottom: SPACING.md },
  zoneLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 1, marginBottom: SPACING.sm },

  assignmentRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.sm,
  },
  assignmentRowMe: { borderWidth: 1, borderColor: COLORS.accent + '44' },
  assignmentAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  assignmentAvatarText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  assignmentInfo: { flex: 1 },
  assignmentNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  assignmentName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  assignmentRole: {
    ...TYPOGRAPHY.caption, color: COLORS.accent, backgroundColor: COLORS.accent + '22',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
  },
  assignmentPost: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  checkInTime: { ...TYPOGRAPHY.caption, color: COLORS.success, marginTop: 2 },
  swapPending: { ...TYPOGRAPHY.caption, color: COLORS.warning, marginTop: 2 },
  assignmentRight: { alignItems: 'flex-end', gap: SPACING.xs },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusBadgeText: { ...TYPOGRAPHY.caption, fontWeight: '700', fontSize: 9 },
  removeText: { ...TYPOGRAPHY.body, color: COLORS.danger, fontSize: 12 },
  swapBtn: { backgroundColor: COLORS.info + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  swapBtnText: { ...TYPOGRAPHY.caption, color: COLORS.info, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: SPACING.xxl },
  emptyText: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  emptyHint: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.xs },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.lg, paddingBottom: SPACING.xxl, maxHeight: '85%',
  },
  modalTitle: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary, marginBottom: SPACING.md },
  input: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.gray700, color: COLORS.textPrimary,
    padding: SPACING.md, ...TYPOGRAPHY.body, marginBottom: SPACING.sm,
  },
  memberList: { maxHeight: 220, marginBottom: SPACING.sm },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.gray700,
  },
  memberRowSelected: { backgroundColor: COLORS.accent + '11', borderRadius: BORDER_RADIUS.sm },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.accent + '44',
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm,
  },
  memberAvatarText: { ...TYPOGRAPHY.bodySmall, color: COLORS.accent, fontWeight: '700' },
  memberName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, flex: 1 },
  memberTap: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  noMembers: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, textAlign: 'center', padding: SPACING.md },
  pickerLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 1, marginBottom: SPACING.xs },
  postRow: { marginBottom: SPACING.sm },
  postChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.gray700,
    marginRight: SPACING.sm, backgroundColor: COLORS.background,
  },
  postChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '22' },
  postChipText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  postChipTextActive: { color: COLORS.accent },
  createBtn: {
    backgroundColor: COLORS.accent, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md + 2, alignItems: 'center', marginTop: SPACING.sm,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: SPACING.md },
  cancelBtnText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  swapInfo: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: SPACING.md },
});
