import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { OrgMember } from '@/types/user';

export const userService = {
  async listOrgMembers(): Promise<OrgMember[]> {
    const { members } = await apiClient.get<{ members: OrgMember[] }>(ENDPOINTS.USERS.LIST);
    return members;
  },

  async adminUpdateMember(
    id: string,
    data: { displayName?: string; phone?: string; isOrgAdmin?: boolean },
  ): Promise<OrgMember> {
    const { user } = await apiClient.patch<{ user: OrgMember }>(
      ENDPOINTS.USERS.ADMIN_UPDATE(id),
      data,
    );
    return user;
  },
};
