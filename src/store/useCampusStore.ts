import { create } from 'zustand';
import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { Campus, CampusMember, OrgMemberWithCampus } from '@/types/campus';

interface CampusBasic {
  id: string;
  name: string;
  address?: string | null;
}

interface CampusState {
  campuses: Campus[];
  myMemberships: CampusBasic[];
  currentCampusMembers: CampusMember[];
  orgMembers: OrgMemberWithCampus[];
  isLoading: boolean;
  error: string | null;

  fetchCampuses(): Promise<void>;
  fetchMyMemberships(): Promise<void>;
  createCampus(data: { name: string; description?: string; address?: string }): Promise<Campus>;
  updateCampus(id: string, data: { name?: string; description?: string; address?: string }): Promise<void>;
  deleteCampus(id: string): Promise<void>;
  fetchCampusMembers(campusId: string): Promise<void>;
  fetchOrgMembers(): Promise<void>;
  assignUser(campusId: string, userId: string): Promise<void>;
  removeUser(campusId: string, userId: string): Promise<void>;
  clearError(): void;
}

export const useCampusStore = create<CampusState>((set, get) => ({
  campuses: [],
  myMemberships: [],
  currentCampusMembers: [],
  orgMembers: [],
  isLoading: false,
  error: null,

  async fetchMyMemberships() {
    try {
      const { campuses } = await apiClient.get<{ campuses: CampusBasic[] }>(
        ENDPOINTS.CAMPUSES.MY_MEMBERSHIPS,
      );
      set({ myMemberships: campuses });
    } catch {
      // Non-fatal — switcher just won't show for campus-scoped members
    }
  },

  async fetchCampuses() {
    set({ isLoading: true, error: null });
    try {
      const { campuses } = await apiClient.get<{ campuses: Campus[] }>(ENDPOINTS.CAMPUSES.LIST);
      set({ campuses });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load campuses' });
    } finally {
      set({ isLoading: false });
    }
  },

  async createCampus(data) {
    const { campus } = await apiClient.post<{ campus: Campus }>(ENDPOINTS.CAMPUSES.CREATE, data);
    set((s) => ({ campuses: [...s.campuses, campus] }));
    return campus;
  },

  async updateCampus(id, data) {
    const { campus } = await apiClient.patch<{ campus: Campus }>(ENDPOINTS.CAMPUSES.UPDATE(id), data);
    set((s) => ({ campuses: s.campuses.map((c) => (c.id === id ? campus : c)) }));
  },

  async deleteCampus(id) {
    await apiClient.delete(ENDPOINTS.CAMPUSES.DELETE(id));
    set((s) => ({ campuses: s.campuses.filter((c) => c.id !== id) }));
  },

  async fetchCampusMembers(campusId) {
    set({ isLoading: true, error: null });
    try {
      const { members } = await apiClient.get<{ members: CampusMember[] }>(
        ENDPOINTS.CAMPUSES.MEMBERS(campusId),
      );
      set({ currentCampusMembers: members });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load members' });
    } finally {
      set({ isLoading: false });
    }
  },

  async fetchOrgMembers() {
    set({ isLoading: true, error: null });
    try {
      const { members } = await apiClient.get<{ members: OrgMemberWithCampus[] }>(
        ENDPOINTS.CAMPUSES.ORG_MEMBERS,
      );
      set({ orgMembers: members });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load members' });
    } finally {
      set({ isLoading: false });
    }
  },

  async assignUser(campusId, userId) {
    await apiClient.post(ENDPOINTS.CAMPUSES.ASSIGN_USER(campusId), { userId });
    // Refresh org members to reflect new assignment
    await get().fetchOrgMembers();
  },

  async removeUser(campusId, userId) {
    await apiClient.delete(ENDPOINTS.CAMPUSES.REMOVE_USER(campusId, userId));
    await get().fetchOrgMembers();
  },

  clearError() {
    set({ error: null });
  },
}));
