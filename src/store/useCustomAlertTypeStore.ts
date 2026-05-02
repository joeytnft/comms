import { create } from 'zustand';
import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { CustomAlertType, AlertLevel, AlertTypeKey } from '@/types';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'alert-type-prefs' });
const HIDDEN_KEY = 'hiddenBuiltinAlertTypes';

function loadHidden(): Set<AlertTypeKey> {
  try {
    const raw = storage.getString(HIDDEN_KEY);
    return raw ? new Set(JSON.parse(raw) as AlertTypeKey[]) : new Set();
  } catch { return new Set(); }
}
function saveHidden(s: Set<AlertTypeKey>) {
  storage.set(HIDDEN_KEY, JSON.stringify([...s]));
}

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
  hiddenBuiltinTypes: Set<AlertTypeKey>;
  fetchTypes: () => Promise<void>;
  createType: (data: CreatePayload) => Promise<CustomAlertType>;
  deleteType: (id: string) => Promise<void>;
  hideBuiltinType: (key: AlertTypeKey) => void;
  restoreBuiltinType: (key: AlertTypeKey) => void;
}

export const useCustomAlertTypeStore = create<CustomAlertTypeState>((set) => ({
  types: [],
  isLoading: false,
  hiddenBuiltinTypes: loadHidden(),

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

  hideBuiltinType: (key) => {
    set((state) => {
      const next = new Set(state.hiddenBuiltinTypes);
      next.add(key);
      saveHidden(next);
      return { hiddenBuiltinTypes: next };
    });
  },

  restoreBuiltinType: (key) => {
    set((state) => {
      const next = new Set(state.hiddenBuiltinTypes);
      next.delete(key);
      saveHidden(next);
      return { hiddenBuiltinTypes: next };
    });
  },
}));
