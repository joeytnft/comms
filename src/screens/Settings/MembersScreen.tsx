import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/MoreStackNavigator';
import { useMembersStore } from '@/store/useMembersStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePcoStore } from '@/store/usePcoStore';
import { OrgMember } from '@/types/user';
import { PcoPerson } from '@/services/pcoClientService';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

export function MembersScreen() {
  const { members, isLoading, error, fetchMembers, updateMember } = useMembersStore();
  const { user } = useAuthStore();
  const { status: pcoStatus, people: pcoPeople, fetchPeople } = usePcoStore();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  const [editTarget, setEditTarget] = useState<OrgMember | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchMembers();
      if (pcoStatus?.connected) fetchPeople();
    }, [pcoStatus?.connected]),
  );

  const openEdit = (member: OrgMember) => {
    setEditTarget(member);
    setEditName(member.displayName);
    setEditPhone(member.phone ?? '');
    setEditIsAdmin(member.isOrgAdmin ?? false);
  };

  const closeEdit = () => {
    setEditTarget(null);
  };

  const handleSave = async () => {
    if (!editTarget) return;
    if (!editName.trim()) {
      Alert.alert('Error', 'Display name is required');
      return;
    }

    setIsSaving(true);
    try {
      await updateMember(editTarget.id, {
        displayName: editName.trim(),
        phone: editPhone.trim() || undefined,
        isOrgAdmin: editIsAdmin,
      });
      closeEdit();
    } catch {
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const isOwner = user?.role === 'owner';
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  // Who can tap to edit:
  // - owner can edit anyone except other owners (server blocks that anyway)
  // - admin can edit non-owner members
  // - regular members cannot edit others
  const canEdit = (member: OrgMember) => {
    if (!isAdmin) return false;
    if (member.role === 'owner') return false; // nobody edits the owner except possibly themselves
    return true;
  };

  // Whether to show the admin toggle for a given edit target:
  // - owner: can toggle anyone who isn't the org owner
  // - admin: can only promote plain members (not demote existing admins — owner-only action)
  const canToggleAdmin = (target: OrgMember | null) => {
    if (!target) return false;
    if (target.role === 'owner') return false;
    if (isOwner) return true;
    // Admins can promote a member to admin, but cannot demote an existing admin
    return target.role === 'member';
  };

  const renderMember = ({ item }: { item: OrgMember }) => {
    const isMe = item.id === user?.id;
    const roleLabel =
      item.role === 'owner' ? 'Owner' : item.role === 'admin' ? 'Admin' : 'Member';
    const roleBadgeStyle =
      item.role === 'owner'
        ? styles.badgeOwner
        : item.role === 'admin'
          ? styles.badgeAdmin
          : styles.badgeMember;

    return (
      <TouchableOpacity
        style={styles.memberCard}
        onPress={() => openEdit(item)}
        disabled={!canEdit(item)}
        activeOpacity={0.7}
      >
        <View style={styles.memberAvatar}>
          <Text style={styles.avatarText}>{item.displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>
            {item.displayName}
            {isMe ? ' (you)' : ''}
          </Text>
          <Text style={styles.memberEmail}>{item.email}</Text>
          {item.campus && (
            <Text style={styles.memberCampus}>{item.campus.name}</Text>
          )}
        </View>
        <View style={styles.memberMeta}>
          <View style={[styles.roleBadge, roleBadgeStyle]}>
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
          {canEdit(item) && <Text style={styles.chevron}>{'>'}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Members</Text>
        <View style={styles.backButton} />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SectionList
        sections={[
          {
            key: 'app',
            title: `App Members (${members.length})`,
            data: members,
            type: 'member' as const,
          },
          ...(pcoStatus?.connected && pcoPeople.length > 0
            ? [{
                key: 'pco',
                title: `PCO Directory (${pcoPeople.length})`,
                data: pcoPeople as unknown as OrgMember[],
                type: 'pco' as const,
              }]
            : []),
        ]}
        keyExtractor={(item, index) => (item as OrgMember).id ?? String(index)}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item, section }) => {
          if ((section as { type: string }).type === 'pco') {
            const p = item as unknown as PcoPerson;
            return (
              <View style={styles.memberCard}>
                <View style={[styles.memberAvatar, styles.pcoAvatar]}>
                  <Text style={styles.avatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{p.name}</Text>
                  {p.email && <Text style={styles.memberEmail}>{p.email}</Text>}
                  {p.phone && <Text style={styles.memberEmail}>{p.phone}</Text>}
                </View>
                <View style={styles.pcoBadge}>
                  <Text style={styles.pcoBadgeText}>PCO</Text>
                </View>
              </View>
            );
          }
          return renderMember({ item: item as OrgMember });
        }}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => { fetchMembers(); if (pcoStatus?.connected) fetchPeople(); }}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No members found</Text>
            </View>
          ) : null
        }
      />

      {/* Edit Modal */}
      <Modal
        visible={editTarget !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEdit}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeEdit} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Member</Text>
            <TouchableOpacity onPress={handleSave} disabled={isSaving} style={styles.modalSave}>
              <Text style={[styles.modalSaveText, isSaving && styles.modalSaveDisabled]}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                style={styles.textInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Display name"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.textInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Phone number (optional)"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            {/* Admin toggle
                - Owner: promote or demote anyone (except the org owner themselves)
                - Admin: promote plain members only (demotion is owner-only) */}
            {canToggleAdmin(editTarget) && (
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Org Admin</Text>
                  <Text style={styles.toggleSub}>
                    {isOwner
                      ? 'Admins can manage members, assignments, and org settings'
                      : 'Grant this member admin access to manage members and org settings'}
                  </Text>
                </View>
                <Switch
                  value={editIsAdmin}
                  onValueChange={setEditIsAdmin}
                  trackColor={{ false: COLORS.gray600, true: COLORS.accent }}
                  thumbColor={COLORS.white}
                />
              </View>
            )}

            {isAdmin && editTarget && (
              <TouchableOpacity
                style={styles.qualificationsLink}
                onPress={() => {
                  closeEdit();
                  navigation.navigate('Training', {
                    screen: 'MemberQualifications',
                    params: { userId: editTarget.id, memberName: editTarget.displayName },
                  });
                }}
              >
                <Text style={styles.qualificationsLinkText}>View / Manage Qualifications</Text>
                <Text style={styles.chevron}>{'>'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  backButton: { width: 80 },
  backText: { ...TYPOGRAPHY.body, color: COLORS.info },
  title: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary },
  errorBanner: {
    backgroundColor: COLORS.danger + '22',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  errorText: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger },
  list: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  countLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { ...TYPOGRAPHY.heading3, color: COLORS.white, fontWeight: '700' },
  memberInfo: { flex: 1, marginLeft: SPACING.md },
  memberName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  memberEmail: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  memberCampus: { ...TYPOGRAPHY.caption, color: COLORS.info, marginTop: 2 },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  roleBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  badgeOwner: { backgroundColor: COLORS.accent + '33' },
  badgeAdmin: { backgroundColor: COLORS.warning + '33' },
  badgeMember: { backgroundColor: COLORS.gray700 },
  roleText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  sectionHeader: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    backgroundColor: COLORS.background,
  },
  pcoAvatar: { backgroundColor: '#e8410e' },
  pcoBadge: {
    backgroundColor: '#e8410e22',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  pcoBadgeText: { ...TYPOGRAPHY.caption, color: '#e8410e', fontWeight: '700' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  modalCancel: { width: 70 },
  modalCancelText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  modalTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  modalSave: { width: 70, alignItems: 'flex-end' },
  modalSaveText: { ...TYPOGRAPHY.body, color: COLORS.accent, fontWeight: '600' },
  modalSaveDisabled: { opacity: 0.5 },
  modalContent: { padding: SPACING.lg },
  field: { marginBottom: SPACING.lg },
  fieldLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.gray700,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  toggleInfo: { flex: 1, marginRight: SPACING.md },
  toggleLabel: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  toggleSub: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  qualificationsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  qualificationsLinkText: { ...TYPOGRAPHY.body, color: COLORS.accent, fontWeight: '600' },
  chevron: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
});
