export interface QualificationType {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  validityDays: number; // 0 = never expires
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface MemberQualification {
  id: string;
  userId: string;
  qualificationTypeId: string;
  earnedDate: string;
  expiresAt: string | null;
  notes: string | null;
  awardedBy: string;
  createdAt: string;
  qualificationType: QualificationType;
}

export interface QualifiedMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  memberQualifications: MemberQualification[];
}

export interface AwardQualificationData {
  qualificationTypeId: string;
  earnedDate: string;
  notes?: string;
}

export function isQualificationExpired(qual: MemberQualification): boolean {
  if (!qual.expiresAt) return false;
  return new Date(qual.expiresAt) < new Date();
}

export function isQualificationExpiringSoon(qual: MemberQualification, withinDays = 30): boolean {
  if (!qual.expiresAt) return false;
  const exp = new Date(qual.expiresAt);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + withinDays);
  return exp > new Date() && exp <= threshold;
}
