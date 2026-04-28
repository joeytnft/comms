export interface TeamMemberLocation {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  latitude: number;
  longitude: number;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface Geofence {
  id: string;
  organizationId: string;
  campusId: string;
  name: string;
  type: 'circle' | 'polygon';
  latitude: number;
  longitude: number;
  radius: number; // metres (bounding circle for polygons)
  polygon: number[][] | null; // GeoJSON ring [[lng, lat], ...] when type === 'polygon'
  createdAt: string;
  updatedAt: string;
}
