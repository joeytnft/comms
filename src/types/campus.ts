export interface Campus {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    campusMemberships: number;
    groups: number;
  };
}

export interface CampusMember {
  id: string;
  displayName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface OrgMemberWithCampus {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  campusId: string | null;
  campusMemberships: { campusId: string; campus: { id: string; name: string } }[];
}
