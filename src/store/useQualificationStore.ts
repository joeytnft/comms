import { create } from 'zustand';
import {
  QualificationType,
  MemberQualification,
  QualifiedMember,
  AwardQualificationData,
} from '@/types';
import { qualificationService } from '@/services/qualificationService';

interface QualificationState {
  qualificationTypes: QualificationType[];
  // Map of userId -> their qualifications
  memberQualifications: Record<string, MemberQualification[]>;
  // Org-wide summary (admin view)
  qualifiedMembers: QualifiedMember[];
  isLoading: boolean;
  error: string | null;

  fetchTypes: () => Promise<void>;
  createType: (data: { name: string; description?: string; validityDays?: number }) => Promise<QualificationType>;
  updateType: (
    id: string,
    data: { name?: string; description?: string; validityDays?: number; isActive?: boolean },
  ) => Promise<void>;
  deleteType: (id: string) => Promise<void>;

  fetchMemberQualifications: (userId: string) => Promise<void>;
  awardQualification: (userId: string, data: AwardQualificationData) => Promise<void>;
  revokeQualification: (userId: string, qualificationTypeId: string) => Promise<void>;

  fetchSummary: () => Promise<void>;

  clearError: () => void;
}

export const useQualificationStore = create<QualificationState>((set) => ({
  qualificationTypes: [],
  memberQualifications: {},
  qualifiedMembers: [],
  isLoading: false,
  error: null,

  fetchTypes: async () => {
    set({ isLoading: true, error: null });
    try {
      const { qualificationTypes } = await qualificationService.listTypes();
      set({ qualificationTypes, isLoading: false });
    } catch (e: unknown) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load qualification types',
      });
    }
  },

  createType: async (data) => {
    const { qualificationType } = await qualificationService.createType(data);
    set((s) => ({ qualificationTypes: [...s.qualificationTypes, qualificationType] }));
    return qualificationType;
  },

  updateType: async (id, data) => {
    const { qualificationType } = await qualificationService.updateType(id, data);
    set((s) => ({
      qualificationTypes: s.qualificationTypes.map((t) => (t.id === id ? qualificationType : t)),
    }));
  },

  deleteType: async (id) => {
    await qualificationService.deleteType(id);
    set((s) => ({ qualificationTypes: s.qualificationTypes.filter((t) => t.id !== id) }));
  },

  fetchMemberQualifications: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const { qualifications } = await qualificationService.getMemberQualifications(userId);
      set((s) => ({
        memberQualifications: { ...s.memberQualifications, [userId]: qualifications },
        isLoading: false,
      }));
    } catch (e: unknown) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load qualifications',
      });
    }
  },

  awardQualification: async (userId, data) => {
    const { qualification } = await qualificationService.awardQualification(userId, data);
    set((s) => {
      const existing = s.memberQualifications[userId] ?? [];
      const updated = existing.some((q) => q.qualificationTypeId === data.qualificationTypeId)
        ? existing.map((q) =>
            q.qualificationTypeId === data.qualificationTypeId ? qualification : q,
          )
        : [...existing, qualification];
      return {
        memberQualifications: { ...s.memberQualifications, [userId]: updated },
      };
    });
  },

  revokeQualification: async (userId, qualificationTypeId) => {
    await qualificationService.revokeQualification(userId, qualificationTypeId);
    set((s) => ({
      memberQualifications: {
        ...s.memberQualifications,
        [userId]: (s.memberQualifications[userId] ?? []).filter(
          (q) => q.qualificationTypeId !== qualificationTypeId,
        ),
      },
    }));
  },

  fetchSummary: async () => {
    set({ isLoading: true, error: null });
    try {
      const { members } = await qualificationService.getSummary();
      set({ qualifiedMembers: members, isLoading: false });
    } catch (e: unknown) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load qualifications summary',
      });
    }
  },

  clearError: () => set({ error: null }),
}));
