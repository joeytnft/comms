import { create } from 'zustand';
import { OrgMember } from '@/types/user';
import { userService } from '@/services/userService';

interface MembersState {
  members: OrgMember[];
  isLoading: boolean;
  error: string | null;

  fetchMembers: () => Promise<void>;
  updateMember: (id: string, data: { displayName?: string; phone?: string; isOrgAdmin?: boolean }) => Promise<void>;
  clearError: () => void;
}

export const useMembersStore = create<MembersState>((set) => ({
  members: [],
  isLoading: false,
  error: null,

  fetchMembers: async () => {
    set({ isLoading: true, error: null });
    try {
      const members = await userService.listOrgMembers();
      set({ members, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load members';
      set({ error: message, isLoading: false });
    }
  },

  updateMember: async (id, data) => {
    set({ error: null });
    try {
      const updated = await userService.adminUpdateMember(id, data);
      set((state) => ({
        members: state.members.map((m) =>
          m.id === id ? { ...m, ...updated } : m,
        ),
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update member';
      set({ error: message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
