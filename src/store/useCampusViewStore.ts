import { create } from 'zustand';

/**
 * Tracks the active campus "view" for org-level users (owners/admins with no
 * campus assignment). Regular campus-assigned users don't use this — their
 * campusId comes from the JWT and is enforced server-side.
 *
 * When activeCampusId is null the org-level user sees the whole org (no filter).
 */
interface CampusViewState {
  activeCampusId: string | null;
  activeCampusName: string | null;
  setActiveCampus(id: string | null, name: string | null): void;
}

export const useCampusViewStore = create<CampusViewState>((set) => ({
  activeCampusId: null,
  activeCampusName: null,
  setActiveCampus: (id, name) => set({ activeCampusId: id, activeCampusName: name }),
}));
