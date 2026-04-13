export interface User {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  avatarUrl?: string;
  publicKey: string;
  organizationId: string;
  campusId?: string | null;
  role?: OrganizationRole;
  createdAt: string;
  lastSeenAt?: string;
}

export interface UserProfile extends User {
  role: OrganizationRole;
}

export type OrganizationRole = 'owner' | 'admin' | 'member';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  organizationCode?: string; // Org invite code — joins org only
  organizationName?: string; // Creates a new org (admin signup)
  groupInviteCode?: string;  // Group invite code — joins org + group in one step
}
