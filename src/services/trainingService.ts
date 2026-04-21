import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { TrainingEvent, TrainingSignup, CreateTrainingData, UpdateTrainingData } from '@/types';

export const trainingService = {
  async listTrainings(): Promise<{ trainings: TrainingEvent[] }> {
    const response = await apiClient.get(ENDPOINTS.TRAINING.LIST);
    return response;
  },

  async getTraining(id: string): Promise<{ training: TrainingEvent }> {
    const response = await apiClient.get(ENDPOINTS.TRAINING.GET(id));
    return response;
  },

  async createTraining(data: CreateTrainingData): Promise<{ training: TrainingEvent }> {
    const response = await apiClient.post(ENDPOINTS.TRAINING.CREATE, data);
    return response;
  },

  async updateTraining(id: string, data: UpdateTrainingData): Promise<{ training: TrainingEvent }> {
    const response = await apiClient.put(ENDPOINTS.TRAINING.UPDATE(id), data);
    return response;
  },

  async deleteTraining(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TRAINING.DELETE(id));
  },

  async signUp(trainingId: string, notes?: string): Promise<{ signup: TrainingSignup }> {
    const response = await apiClient.post(ENDPOINTS.TRAINING.SIGNUP(trainingId), { notes });
    return response;
  },

  async cancelSignup(trainingId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TRAINING.CANCEL_SIGNUP(trainingId));
  },

  async listSignups(trainingId: string): Promise<{ signups: TrainingSignup[] }> {
    const response = await apiClient.get(ENDPOINTS.TRAINING.LIST_SIGNUPS(trainingId));
    return response;
  },
};
