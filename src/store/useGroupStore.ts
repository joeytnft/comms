import { create } from 'zustand';
import { Group, GroupWithMembers, GroupHierarchy, CreateGroupData, InviteMemberData } from '@/types';
import { groupService } from '@/services/groupService';

interface GroupState {
  groups: Group[];
  currentGroup: GroupWithMembers | null;
  hierarchy: GroupHierarchy[];
  isLoading: boolean;
  error: string | null;

  fetchGroups: () => Promise<void>;
  fetchGroup: (id: string) => Promise<void>;
  fetchHierarchy: () => Promise<void>;
  createGroup: (data: CreateGroupData) => Promise<Group>;
  updateGroup: (id: string, data: Partial<CreateGroupData>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  addMember: (data: InviteMemberData) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  generateInvite: (groupId: string) => Promise<string>;
  revokeInvite: (groupId: string) => Promise<void>;
  joinByInvite: (inviteCode: string) => Promise<void>;
  clearError: () => void;
  clearCurrentGroup: () => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroup: null,
  hierarchy: [],
  isLoading: false,
  error: null,

  fetchGroups: async () => {
    set({ isLoading: true, error: null });
    try {
      const { groups } = await groupService.listGroups();
      set({ groups, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load groups';
      set({ error: message, isLoading: false });
    }
  },

  fetchGroup: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { group } = await groupService.getGroup(id);
      set({ currentGroup: group, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load group';
      set({ error: message, isLoading: false });
    }
  },

  fetchHierarchy: async () => {
    set({ isLoading: true, error: null });
    try {
      const { hierarchy } = await groupService.getHierarchy();
      set({ hierarchy, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load hierarchy';
      set({ error: message, isLoading: false });
    }
  },

  createGroup: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const { group } = await groupService.createGroup(data);
      set((state) => ({
        groups: [...state.groups, group],
        isLoading: false,
      }));
      return group;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create group';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateGroup: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const { group } = await groupService.updateGroup(id, data);
      set((state) => ({
        groups: state.groups.map((g) => (g.id === id ? { ...g, ...group } : g)),
        currentGroup: state.currentGroup?.id === id
          ? { ...state.currentGroup, ...group }
          : state.currentGroup,
        isLoading: false,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update group';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteGroup: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await groupService.deleteGroup(id);
      set((state) => ({
        groups: state.groups.filter((g) => g.id !== id),
        currentGroup: state.currentGroup?.id === id ? null : state.currentGroup,
        isLoading: false,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete group';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  addMember: async (data) => {
    set({ error: null });
    try {
      const { member } = await groupService.addMember(data);
      set((state) => {
        if (state.currentGroup?.id === data.groupId) {
          return {
            currentGroup: {
              ...state.currentGroup,
              members: [...state.currentGroup.members, member],
              memberCount: state.currentGroup.memberCount + 1,
            },
          };
        }
        return {};
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add member';
      set({ error: message });
      throw error;
    }
  },

  removeMember: async (groupId, userId) => {
    set({ error: null });
    try {
      await groupService.removeMember(groupId, userId);
      set((state) => {
        if (state.currentGroup?.id === groupId) {
          return {
            currentGroup: {
              ...state.currentGroup,
              members: state.currentGroup.members.filter((m) => m.userId !== userId),
              memberCount: state.currentGroup.memberCount - 1,
            },
          };
        }
        return {};
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to remove member';
      set({ error: message });
      throw error;
    }
  },

  generateInvite: async (groupId) => {
    set({ error: null });
    try {
      const { inviteCode } = await groupService.generateInvite(groupId);
      set((state) => {
        if (state.currentGroup?.id === groupId) {
          return { currentGroup: { ...state.currentGroup, inviteCode } };
        }
        return {};
      });
      return inviteCode;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate invite';
      set({ error: message });
      throw error;
    }
  },

  revokeInvite: async (groupId) => {
    set({ error: null });
    try {
      await groupService.revokeInvite(groupId);
      set((state) => {
        if (state.currentGroup?.id === groupId) {
          return { currentGroup: { ...state.currentGroup, inviteCode: null } };
        }
        return {};
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to revoke invite';
      set({ error: message });
      throw error;
    }
  },

  joinByInvite: async (inviteCode) => {
    set({ isLoading: true, error: null });
    try {
      const { group } = await groupService.joinByInvite(inviteCode);
      set((state) => ({
        groups: [...state.groups, group],
        isLoading: false,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to join group';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
  clearCurrentGroup: () => set({ currentGroup: null }),
}));
