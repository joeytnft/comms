import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { GroupWithMembers, GroupHierarchy, CreateGroupData, InviteMemberData, GroupMember } from '@/types';

interface GroupListResponse {
  groups: GroupWithMembers[];
}

interface GroupDetailResponse {
  group: GroupWithMembers;
}

interface HierarchyResponse {
  hierarchy: GroupHierarchy[];
}

interface MemberResponse {
  member: GroupMember;
}

export const groupService = {
  async listGroups(): Promise<GroupListResponse> {
    return apiClient.get<GroupListResponse>(ENDPOINTS.GROUPS.LIST);
  },

  async createGroup(data: CreateGroupData): Promise<GroupDetailResponse> {
    return apiClient.post<GroupDetailResponse>(ENDPOINTS.GROUPS.CREATE, data);
  },

  async getGroup(id: string): Promise<GroupDetailResponse> {
    return apiClient.get<GroupDetailResponse>(ENDPOINTS.GROUPS.GET(id));
  },

  async updateGroup(id: string, data: Partial<CreateGroupData>): Promise<GroupDetailResponse> {
    return apiClient.put<GroupDetailResponse>(ENDPOINTS.GROUPS.UPDATE(id), data);
  },

  async deleteGroup(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.GROUPS.DELETE(id));
  },

  async addMember(data: InviteMemberData): Promise<MemberResponse> {
    return apiClient.post<MemberResponse>(ENDPOINTS.GROUPS.ADD_MEMBER(data.groupId), data);
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.GROUPS.REMOVE_MEMBER(groupId, userId));
  },

  async getHierarchy(): Promise<HierarchyResponse> {
    return apiClient.get<HierarchyResponse>(ENDPOINTS.GROUPS.HIERARCHY);
  },

  async generateInvite(groupId: string): Promise<{ inviteCode: string }> {
    return apiClient.post<{ inviteCode: string }>(ENDPOINTS.GROUPS.GENERATE_INVITE(groupId), {});
  },

  async revokeInvite(groupId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.GROUPS.REVOKE_INVITE(groupId));
  },

  async joinByInvite(inviteCode: string): Promise<GroupDetailResponse> {
    return apiClient.post<GroupDetailResponse>(ENDPOINTS.GROUPS.JOIN_BY_INVITE, { inviteCode });
  },
};
