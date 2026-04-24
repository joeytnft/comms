import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { TrainingEvent, TrainingSignup, CreateTrainingData, UpdateTrainingData } from '@/types';

export const trainingService = {
  async listTrainings(): Promise<{ trainings: TrainingEvent[] }> {
    return apiClient.get<{ trainings: TrainingEvent[] }>(ENDPOINTS.TRAINING.LIST);
  },

  async getTraining(id: string): Promise<{ training: TrainingEvent }> {
    return apiClient.get<{ training: TrainingEvent }>(ENDPOINTS.TRAINING.GET(id));
  },

  async createTraining(data: CreateTrainingData): Promise<{ training: TrainingEvent }> {
    return apiClient.post<{ training: TrainingEvent }>(ENDPOINTS.TRAINING.CREATE, data);
  },

  async updateTraining(id: string, data: UpdateTrainingData): Promise<{ training: TrainingEvent }> {
    return apiClient.put<{ training: TrainingEvent }>(ENDPOINTS.TRAINING.UPDATE(id), data);
  },

  async deleteTraining(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TRAINING.DELETE(id));
  },

  async signUp(trainingId: string, notes?: string): Promise<{ signup: TrainingSignup }> {
    return apiClient.post<{ signup: TrainingSignup }>(ENDPOINTS.TRAINING.SIGNUP(trainingId), { notes });
  },

  async cancelSignup(trainingId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TRAINING.CANCEL_SIGNUP(trainingId));
  },

  async listSignups(trainingId: string): Promise<{ signups: TrainingSignup[] }> {
    return apiClient.get<{ signups: TrainingSignup[] }>(ENDPOINTS.TRAINING.LIST_SIGNUPS(trainingId));
  },
};
