import { create } from 'zustand';
import { Alert, TriggerAlertData } from '@/types';
import { alertService } from '@/services/alertService';

interface AlertState {
  alerts: Alert[];
  activeAlerts: Alert[];
  isLoading: boolean;
  error: string | null;
  nextCursor: string | null;

  fetchAlerts: (opts?: { active?: boolean; refresh?: boolean; campusId?: string | null }) => Promise<void>;
  loadMore: () => Promise<void>;
  triggerAlert: (data: TriggerAlertData) => Promise<Alert>;
  acknowledgeAlert: (id: string) => Promise<void>;
  resolveAlert: (id: string) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;

  // Socket-driven updates
  addAlert: (alert: Alert) => void;
  updateAlertAcknowledgment: (alertId: string, userId: string, displayName?: string) => void;
  markAlertResolved: (alertId: string, resolvedBy: string) => void;

  clearError: () => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  activeAlerts: [],
  isLoading: false,
  error: null,
  nextCursor: null,

  fetchAlerts: async (opts) => {
    set({ isLoading: true, error: null });
    try {
      const { alerts, nextCursor } = await alertService.listAlerts({
        active: opts?.active,
        limit: 20,
        campusId: opts?.campusId,
      });
      set({ alerts, nextCursor, isLoading: false });
      if (opts?.active) {
        set({ activeAlerts: alerts });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load alerts';
      set({ error: message, isLoading: false });
    }
  },

  loadMore: async () => {
    const { nextCursor } = get();
    if (!nextCursor) return;

    try {
      const { alerts: more, nextCursor: newCursor } = await alertService.listAlerts({
        cursor: nextCursor,
        limit: 20,
      });
      set((state) => ({
        alerts: [...state.alerts, ...more],
        nextCursor: newCursor,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load more alerts';
      set({ error: message });
    }
  },

  triggerAlert: async (data) => {
    set({ error: null });
    try {
      const { alert } = await alertService.triggerAlert(data);
      set((state) => ({
        alerts: [alert, ...state.alerts],
        activeAlerts: [alert, ...state.activeAlerts],
      }));
      return alert;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to trigger alert';
      set({ error: message });
      throw error;
    }
  },

  acknowledgeAlert: async (id) => {
    set({ error: null });
    try {
      const { alert } = await alertService.acknowledgeAlert(id);
      set((state) => ({
        alerts: state.alerts.map((a) => (a.id === id ? alert : a)),
        activeAlerts: state.activeAlerts.map((a) => (a.id === id ? alert : a)),
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to acknowledge alert';
      set({ error: message });
      throw error;
    }
  },

  resolveAlert: async (id) => {
    set({ error: null });
    try {
      const { alert } = await alertService.resolveAlert(id);
      set((state) => ({
        alerts: state.alerts.map((a) => (a.id === id ? alert : a)),
        activeAlerts: state.activeAlerts.filter((a) => a.id !== id),
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to resolve alert';
      set({ error: message });
      throw error;
    }
  },

  deleteAlert: async (id) => {
    set({ error: null });
    try {
      await alertService.deleteAlert(id);
      set((state) => ({
        alerts: state.alerts.filter((a) => a.id !== id),
        activeAlerts: state.activeAlerts.filter((a) => a.id !== id),
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete alert';
      set({ error: message });
      throw error;
    }
  },

  // Real-time socket updates
  addAlert: (alert) => {
    set((state) => {
      if (state.alerts.some((a) => a.id === alert.id)) return state;
      return {
        alerts: [alert, ...state.alerts],
        activeAlerts: alert.resolvedAt ? state.activeAlerts : [alert, ...state.activeAlerts],
      };
    });
  },

  updateAlertAcknowledgment: (alertId, userId) => {
    set((state) => ({
      alerts: state.alerts.map((a) => {
        if (a.id !== alertId) return a;
        const alreadyAcked = a.acknowledgments.some((ack) => ack.userId === userId);
        if (alreadyAcked) return a;
        return {
          ...a,
          acknowledgments: [...a.acknowledgments, { userId, acknowledgedAt: new Date().toISOString() }],
        };
      }),
      activeAlerts: state.activeAlerts.map((a) => {
        if (a.id !== alertId) return a;
        const alreadyAcked = a.acknowledgments.some((ack) => ack.userId === userId);
        if (alreadyAcked) return a;
        return {
          ...a,
          acknowledgments: [...a.acknowledgments, { userId, acknowledgedAt: new Date().toISOString() }],
        };
      }),
    }));
  },

  markAlertResolved: (alertId, resolvedBy) => {
    const now = new Date().toISOString();
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, resolvedAt: now, resolvedById: resolvedBy } : a,
      ),
      activeAlerts: state.activeAlerts.filter((a) => a.id !== alertId),
    }));
  },

  clearError: () => set({ error: null }),
}));
