import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import {
  QualificationType,
  MemberQualification,
  QualifiedMember,
  AwardQualificationData,
} from '@/types';

export const qualificationService = {
  async listTypes(): Promise<{ qualificationTypes: QualificationType[] }> {
    const response = await apiClient.get(ENDPOINTS.QUALIFICATIONS.TYPES);
    return response.data;
  },

  async createType(data: {
    name: string;
    description?: string;
    validityDays?: number;
  }): Promise<{ qualificationType: QualificationType }> {
    const response = await apiClient.post(ENDPOINTS.QUALIFICATIONS.TYPES, data);
    return response.data;
  },

  async updateType(
    id: string,
    data: { name?: string; description?: string; validityDays?: number; isActive?: boolean },
  ): Promise<{ qualificationType: QualificationType }> {
    const response = await apiClient.put(ENDPOINTS.QUALIFICATIONS.TYPE(id), data);
    return response.data;
  },

  async deleteType(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.QUALIFICATIONS.TYPE(id));
  },

  async getMemberQualifications(
    userId: string,
  ): Promise<{ user: { id: string; displayName: string; avatarUrl: string | null }; qualifications: MemberQualification[] }> {
    const response = await apiClient.get(ENDPOINTS.QUALIFICATIONS.MEMBER(userId));
    return response.data;
  },

  async awardQualification(
    userId: string,
    data: AwardQualificationData,
  ): Promise<{ qualification: MemberQualification }> {
    const response = await apiClient.post(ENDPOINTS.QUALIFICATIONS.MEMBER(userId), data);
    return response.data;
  },

  async revokeQualification(userId: string, qualificationTypeId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.QUALIFICATIONS.REVOKE(userId, qualificationTypeId));
  },

  async getSummary(): Promise<{ members: QualifiedMember[] }> {
    const response = await apiClient.get(ENDPOINTS.QUALIFICATIONS.SUMMARY);
    return response.data;
  },
};
