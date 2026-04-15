import { User } from './user';

export type GroupType = 'lead' | 'sub';
export type MemberRole = 'admin' | 'member';

export interface Group {
  id: string;
  name: string;
  description?: string;
  type: GroupType;
  organizationId: string;
  parentGroupId?: string; // Only for sub-groups — points to lead group
  campusId?: string | null; // Enterprise multi-campus assignment
  campus?: { id: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  iconColor?: string; // For visual identification
  inviteCode?: string | null; // Shareable code for self-join
  alertsEnabled: boolean;
  myRole?: MemberRole | null; // Current user's role in this group (null = visible but not a member)
}

export interface GroupWithMembers extends Group {
  members: GroupMember[];
}

export interface GroupMember {
  id: string;
  userId: string;
  groupId: string;
  role: MemberRole;
  joinedAt: string;
  user: Pick<User, 'id' | 'displayName' | 'avatarUrl' | 'lastSeenAt'>;
}

export interface GroupHierarchy {
  leadGroup: Group;
  subGroups: Group[];
}

export interface CreateGroupData {
  name: string;
  description?: string;
  type: GroupType;
  parentGroupId?: string; // Required if type is 'sub'
  campusId?: string | null;
  iconColor?: string;
  alertsEnabled?: boolean;
}

export interface InviteMemberData {
  groupId: string;
  email?: string;
  userId?: string;
  role: MemberRole;
}
