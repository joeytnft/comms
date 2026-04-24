export interface User {
  id: string;
  email: string;
  displayName: string;
  organizationId: string;
  campusId: string | null;
  isOrgAdmin: boolean;
  role: 'owner' | 'admin' | 'member';
}

export interface Organization {
  id: string;
  name: string;
  inviteCode: string;
  subscriptionTier: string;
}

export interface Geofence {
  id: string;
  organizationId: string;
  campusId: string;
  name: string;
  type: 'circle' | 'polygon';
  latitude: number;
  longitude: number;
  radius: number;
  polygon: number[][] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Campus {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  createdAt: string;
  geofence: Geofence | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
