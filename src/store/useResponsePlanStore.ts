import { create } from 'zustand';
import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

export interface ResponsePlanStep {
  id: string;
  order: number;
  action: string;
  assignedTo: string | null;
}

export interface ResponsePlan {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  steps: ResponsePlanStep[];
}

interface ResponsePlanState {
  plans: ResponsePlan[];
  isLoading: boolean;
  error: string | null;

  fetchPlans(): Promise<void>;
  createPlan(data: {
    name: string;
    description?: string;
    steps?: { order: number; action: string; assignedTo?: string }[];
  }): Promise<ResponsePlan>;
  updatePlan(id: string, data: {
    name?: string;
    description?: string;
    steps?: { order: number; action: string; assignedTo?: string }[];
  }): Promise<void>;
  deletePlan(id: string): Promise<void>;
  clearError(): void;
}

export const useResponsePlanStore = create<ResponsePlanState>((set) => ({
  plans: [],
  isLoading: false,
  error: null,

  async fetchPlans() {
    set({ isLoading: true, error: null });
    try {
      const { plans } = await apiClient.get<{ plans: ResponsePlan[] }>(ENDPOINTS.RESPONSE_PLANS.LIST);
      set({ plans });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load plans' });
    } finally {
      set({ isLoading: false });
    }
  },

  async createPlan(data) {
    const { plan } = await apiClient.post<{ plan: ResponsePlan }>(ENDPOINTS.RESPONSE_PLANS.CREATE, data);
    set((s) => ({ plans: [plan, ...s.plans] }));
    return plan;
  },

  async updatePlan(id, data) {
    const { plan } = await apiClient.patch<{ plan: ResponsePlan }>(ENDPOINTS.RESPONSE_PLANS.UPDATE(id), data);
    set((s) => ({ plans: s.plans.map((p) => (p.id === id ? plan : p)) }));
  },

  async deletePlan(id) {
    await apiClient.delete(ENDPOINTS.RESPONSE_PLANS.DELETE(id));
    set((s) => ({ plans: s.plans.filter((p) => p.id !== id) }));
  },

  clearError() {
    set({ error: null });
  },
}));
