import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCampusStore } from '@/store/useCampusStore';
import { Campus, OrgMemberWithCampus } from '@/types/campus';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

export function CampusManagementScreen() {
  const {
    campuses, orgMembers,
    fetchCampuses, fetchOrgMembers,
    createCampus, updateCampus, deleteCampus,
    assignUser, removeUser,
  } = useCampusStore();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'campuses' | 'members'>('campuses');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAddr, setNewAddr] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<Campus | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAddr, setEditAddr] = useState('');

  // Assign modal
  const [assignCampus, setAssignCampus] = useState<Campus | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchCampuses();
      fetchOrgMembers();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCampuses(), fetchOrgMembers()]);
    setRefreshing(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createCampus({ name: newName.trim(), description: newDesc.trim() || undefined, address: newAddr.trim() || undefined });
      setShowCreate(false);
      setNewName(''); setNewDesc(''); setNewAddr('');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create campus');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      await updateCampus(editTarget.id, { name: editName.trim(), description: editDesc.trim() || undefined, address: editAddr.trim() || undefined });
      setEditTarget(null);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update campus');
    }
  };

  const handleDelete = (campus: Campus) => {
    Alert.alert(
      'Delete Campus',
      `Delete "${campus.name}"? All groups and data linked to this campus will be unlinked but not deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCampus(campus.id);
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete campus');
            }
          },
        },
      ],
    );
  };

  const handleAssign = async (member: OrgMemberWithCampus) => {
    if (!assignCampus) return;
    try {
      await assignUser(assignCampus.id, member.id);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to assign member');
    }
  };

  const handleRemove = (member: OrgMemberWithCampus) => {
    if (!member.campusId) return;
    Alert.alert('Remove from Campus', `Remove ${member.displayName} from their campus?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeUser(member.campusId!, member.id);
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove member');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Campus Management</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['campuses', 'members'] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'campuses' ? 'Campuses' : 'Members'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {activeTab === 'campuses' ? (
          campuses.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No campuses yet</Text>
              <Text style={styles.emptySubtitle}>Create a campus to start assigning members and groups.</Text>
            </View>
          ) : (
            campuses.map((campus) => (
              <View key={campus.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleBlock}>
                    <Text style={styles.cardName}>{campus.name}</Text>
                    {campus.address ? <Text style={styles.cardSub}>{campus.address}</Text> : null}
                    {campus.description ? <Text style={styles.cardDesc}>{campus.description}</Text> : null}
                  </View>
                  <View style={styles.cardStats}>
                    <Text style={styles.statText}>{campus._count.users} members</Text>
                    <Text style={styles.statText}>{campus._count.groups} groups</Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setAssignCampus(campus)}>
                    <Text style={styles.actionBtnText}>Assign Members</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => {
                    setEditTarget(campus);
                    setEditName(campus.name);
                    setEditDesc(campus.description ?? '');
                    setEditAddr(campus.address ?? '');
                  }}>
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleDelete(campus)}>
                    <Text style={[styles.actionBtnText, { color: COLORS.danger }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        ) : (
          orgMembers.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No members</Text>
            </View>
          ) : (
            orgMembers.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{member.displayName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  <Text style={styles.memberCampus}>
                    {member.campus ? member.campus.name : 'Unassigned'}
                  </Text>
                </View>
                {member.campusId ? (
                  <TouchableOpacity style={styles.removeMemberBtn} onPress={() => handleRemove(member)}>
                    <Text style={styles.removeMemberText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* Create campus modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New Campus</Text>
            <TextInput style={styles.input} placeholder="Campus name *" placeholderTextColor={COLORS.textMuted}
              value={newName} onChangeText={setNewName} maxLength={60} />
            <TextInput style={styles.input} placeholder="Address (optional)" placeholderTextColor={COLORS.textMuted}
              value={newAddr} onChangeText={setNewAddr} maxLength={120} />
            <TextInput style={styles.input} placeholder="Description (optional)" placeholderTextColor={COLORS.textMuted}
              value={newDesc} onChangeText={setNewDesc} maxLength={120} />
            <TouchableOpacity style={[styles.primaryBtn, (!newName.trim() || saving) && styles.primaryBtnDisabled]}
              onPress={handleCreate} disabled={!newName.trim() || saving}>
              <Text style={styles.primaryBtnText}>{saving ? 'Creating...' : 'Create Campus'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowCreate(false)}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit campus modal */}
      <Modal visible={!!editTarget} transparent animationType="slide" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit Campus</Text>
            <TextInput style={styles.input} placeholder="Campus name *" placeholderTextColor={COLORS.textMuted}
              value={editName} onChangeText={setEditName} maxLength={60} />
            <TextInput style={styles.input} placeholder="Address" placeholderTextColor={COLORS.textMuted}
              value={editAddr} onChangeText={setEditAddr} maxLength={120} />
            <TextInput style={styles.input} placeholder="Description" placeholderTextColor={COLORS.textMuted}
              value={editDesc} onChangeText={setEditDesc} maxLength={120} />
            <TouchableOpacity style={[styles.primaryBtn, !editName.trim() && styles.primaryBtnDisabled]}
              onPress={handleSaveEdit} disabled={!editName.trim()}>
              <Text style={styles.primaryBtnText}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditTarget(null)}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Assign members modal */}
      <Modal visible={!!assignCampus} transparent animationType="slide" onRequestClose={() => setAssignCampus(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '80%' }]}>
            <Text style={styles.sheetTitle}>Assign to {assignCampus?.name}</Text>
            <Text style={styles.sheetSub}>Tap an unassigned member to add them to this campus.</Text>
            <ScrollView>
              {orgMembers.filter((m) => !m.campusId).map((member) => (
                <TouchableOpacity key={member.id} style={styles.memberRowModal} onPress={() => handleAssign(member)}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{member.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.displayName}</Text>
                    <Text style={styles.memberCampus}>{member.email}</Text>
                  </View>
                  <Text style={styles.assignPlus}>+</Text>
                </TouchableOpacity>
              ))}
              {orgMembers.filter((m) => !m.campusId).length === 0 && (
                <Text style={styles.emptySubtitle}>All members are already assigned to a campus.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setAssignCampus(null)}>
              <Text style={styles.ghostBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPOGRAPHY.heading1, color: COLORS.textPrimary },
  addBtn: {
    backgroundColor: COLORS.accent, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
  },
  addBtnText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '600' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.gray700 },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.accent, fontWeight: '600' },
  list: { padding: SPACING.lg, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, ...SHADOWS.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  cardTitleBlock: { flex: 1 },
  cardName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  cardSub: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, marginTop: 2 },
  cardDesc: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  cardStats: { alignItems: 'flex-end', gap: 2 },
  statText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  cardActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.gray700,
    borderRadius: BORDER_RADIUS.sm, paddingVertical: SPACING.xs, alignItems: 'center',
  },
  actionBtnDanger: { borderColor: COLORS.danger },
  actionBtnText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, ...SHADOWS.sm,
  },
  memberRowModal: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.gray700,
  },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '500' },
  memberCampus: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  removeMemberBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  removeMemberText: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger },
  assignPlus: { ...TYPOGRAPHY.heading2, color: COLORS.accent, paddingHorizontal: SPACING.sm },
  empty: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyTitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, fontWeight: '600' },
  emptySubtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, marginTop: SPACING.xs, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.lg, gap: SPACING.sm,
  },
  sheetTitle: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  sheetSub: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, marginBottom: SPACING.sm },
  input: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.gray700,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    color: COLORS.textPrimary, ...TYPOGRAPHY.body,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.xs,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  ghostBtn: { paddingVertical: SPACING.sm, alignItems: 'center' },
  ghostBtnText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
});
