import { create } from 'zustand';
import { TrainingEvent, TrainingSignup, CreateTrainingData, UpdateTrainingData } from '@/types';
import { trainingService } from '@/services/trainingService';

interface TrainingState {
  trainings: TrainingEvent[];
  currentTraining: TrainingEvent | null;
  signups: TrainingSignup[]; // signups for currently viewed training (admin)
  isLoading: boolean;
  error: string | null;

  fetchTrainings: () => Promise<void>;
  fetchTraining: (id: string) => Promise<void>;
  createTraining: (data: CreateTrainingData) => Promise<TrainingEvent>;
  updateTraining: (id: string, data: UpdateTrainingData) => Promise<void>;
  deleteTraining: (id: string) => Promise<void>;
  signUp: (trainingId: string, notes?: string) => Promise<void>;
  cancelSignup: (trainingId: string) => Promise<void>;
  fetchSignups: (trainingId: string) => Promise<void>;
  clearCurrentTraining: () => void;
  clearError: () => void;
}

export const useTrainingStore = create<TrainingState>((set, _get) => ({
  trainings: [],
  currentTraining: null,
  signups: [],
  isLoading: false,
  error: null,

  fetchTrainings: async () => {
    set({ isLoading: true, error: null });
    try {
      const { trainings } = await trainingService.listTrainings();
      set({ trainings, isLoading: false });
    } catch (e: unknown) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load trainings' });
    }
  },

  fetchTraining: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { training } = await trainingService.getTraining(id);
      set({ currentTraining: training, isLoading: false });
    } catch (e: unknown) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load training' });
    }
  },

  createTraining: async (data) => {
    const { training } = await trainingService.createTraining(data);
    set((s) => ({ trainings: [training, ...s.trainings] }));
    return training;
  },

  updateTraining: async (id, data) => {
    const { training } = await trainingService.updateTraining(id, data);
    set((s) => ({
      trainings: s.trainings.map((t) => (t.id === id ? training : t)),
      currentTraining: s.currentTraining?.id === id ? training : s.currentTraining,
    }));
  },

  deleteTraining: async (id) => {
    await trainingService.deleteTraining(id);
    set((s) => ({
      trainings: s.trainings.filter((t) => t.id !== id),
      currentTraining: s.currentTraining?.id === id ? null : s.currentTraining,
    }));
  },

  signUp: async (trainingId, notes) => {
    const { signup } = await trainingService.signUp(trainingId, notes);
    set((s) => ({
      trainings: s.trainings.map((t) =>
        t.id === trainingId
          ? {
              ...t,
              mySignup: signup,
              confirmedCount:
                signup.status === 'CONFIRMED' ? (t.confirmedCount ?? 0) + 1 : t.confirmedCount,
            }
          : t,
      ),
      currentTraining:
        s.currentTraining?.id === trainingId
          ? { ...s.currentTraining, mySignup: signup }
          : s.currentTraining,
    }));
  },

  cancelSignup: async (trainingId) => {
    await trainingService.cancelSignup(trainingId);
    set((s) => ({
      trainings: s.trainings.map((t) =>
        t.id === trainingId
          ? {
              ...t,
              mySignup: t.mySignup ? { ...t.mySignup, status: 'CANCELLED' } : null,
              confirmedCount: Math.max(0, (t.confirmedCount ?? 1) - 1),
            }
          : t,
      ),
      currentTraining:
        s.currentTraining?.id === trainingId
          ? {
              ...s.currentTraining,
              mySignup: s.currentTraining.mySignup
                ? { ...s.currentTraining.mySignup, status: 'CANCELLED' }
                : null,
            }
          : s.currentTraining,
    }));
  },

  fetchSignups: async (trainingId) => {
    set({ signups: [] });
    const { signups } = await trainingService.listSignups(trainingId);
    set({ signups });
  },

  clearCurrentTraining: () => set({ currentTraining: null, signups: [] }),
  clearError: () => set({ error: null }),
}));
