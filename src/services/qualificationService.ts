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
    return apiClient.get<{ qualificationTypes: QualificationType[] }>(ENDPOINTS.QUALIFICATIONS.TYPES);
  },

  async listActiveTypes(): Promise<{ qualificationTypes: QualificationType[] }> {
    return apiClient.get<{ qualificationTypes: QualificationType[] }>(ENDPOINTS.QUALIFICATIONS.TYPES_ACTIVE);
  },

  async createType(data: {
    name: string;
    description?: string;
    validityDays?: number;
  }): Promise<{ qualificationType: QualificationType }> {
    return apiClient.post<{ qualificationType: QualificationType }>(ENDPOINTS.QUALIFICATIONS.TYPES, data);
  },

  async updateType(
    id: string,
    data: { name?: string; description?: string; validityDays?: number; isActive?: boolean },
  ): Promise<{ qualificationType: QualificationType }> {
    return apiClient.put<{ qualificationType: QualificationType }>(ENDPOINTS.QUALIFICATIONS.TYPE(id), data);
  },

  async deleteType(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.QUALIFICATIONS.TYPE(id));
  },

  async getMemberQualifications(
    userId: string,
  ): Promise<{ user: { id: string; displayName: string; avatarUrl: string | null }; qualifications: MemberQualification[] }> {
    return apiClient.get<{ user: { id: string; displayName: string; avatarUrl: string | null }; qualifications: MemberQualification[] }>(ENDPOINTS.QUALIFICATIONS.MEMBER(userId));
  },

  async awardQualification(
    userId: string,
    data: AwardQualificationData,
  ): Promise<{ qualification: MemberQualification }> {
    return apiClient.post<{ qualification: MemberQualification }>(ENDPOINTS.QUALIFICATIONS.MEMBER(userId), data);
  },

  async revokeQualification(userId: string, qualificationTypeId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.QUALIFICATIONS.REVOKE(userId, qualificationTypeId));
  },

  async getSummary(): Promise<{ members: QualifiedMember[] }> {
    return apiClient.get<{ members: QualifiedMember[] }>(ENDPOINTS.QUALIFICATIONS.SUMMARY);
  },
};
