import { create } from 'zustand';
import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { CustomAlertType, AlertLevel } from '@/types';

interface CreatePayload {
  label: string;
  description?: string;
  color: string;
  emoji: string;
  defaultLevel: AlertLevel;
}

interface CustomAlertTypeState {
  types: CustomAlertType[];
  isLoading: boolean;
  fetchTypes: () => Promise<void>;
  createType: (data: CreatePayload) => Promise<CustomAlertType>;
  deleteType: (id: string) => Promise<void>;
}

export const useCustomAlertTypeStore = create<CustomAlertTypeState>((set) => ({
  types: [],
  isLoading: false,

  fetchTypes: async () => {
    set({ isLoading: true });
    try {
      const { customAlertTypes } = await apiClient.get<{ customAlertTypes: CustomAlertType[] }>(
        ENDPOINTS.CUSTOM_ALERT_TYPES.LIST,
      );
      set({ types: customAlertTypes, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createType: async (data) => {
    const { customAlertType } = await apiClient.post<{ customAlertType: CustomAlertType }>(
      ENDPOINTS.CUSTOM_ALERT_TYPES.CREATE,
      data,
    );
    set((state) => ({ types: [...state.types, customAlertType] }));
    return customAlertType;
  },

  deleteType: async (id) => {
    await apiClient.delete(ENDPOINTS.CUSTOM_ALERT_TYPES.DELETE(id));
    set((state) => ({ types: state.types.filter((t) => t.id !== id) }));
  },
}));
