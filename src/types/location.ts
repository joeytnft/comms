export interface TeamMemberLocation {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  latitude: number;
  longitude: number;
  lastSeenAt: string | null;
  updatedAt: string;
}
