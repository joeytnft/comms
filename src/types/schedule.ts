export const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface TemplateRoleSlot {
  id: string;
  templateId: string;
  postId: string | null;
  roleName: string;
  count: number;
  post: { id: string; name: string; zone: string | null } | null;
}

export interface ServiceTemplate {
  id: string;
  organizationId: string;
  name: string;
  dayOfWeek: number;  // 0=Sun … 6=Sat
  startTime: string;  // "09:00"
  description: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  createdBy: { id: string; displayName: string };
  roleSlots: TemplateRoleSlot[];
  _count: { services: number };
}

export interface Post {
  id: string;
  name: string;
  zone: string | null;
  description: string | null;
}

export interface ShiftCheckIn {
  id: string;
  checkedInAt: string;
  checkedOutAt: string | null;
}

export interface ShiftAssignment {
  id: string;
  serviceId: string;
  userId: string;
  postId: string | null;
  role: string | null;
  notes: string | null;
  createdAt: string;
  user: { id: string; displayName: string; avatarUrl: string | null };
  post: { id: string; name: string; zone: string | null } | null;
  checkIn: ShiftCheckIn | null;
  swapRequests: {
    id: string;
    toUserId: string;
    message: string | null;
    status: SwapStatus;
    createdAt: string;
  }[];
}

export interface ServiceSchedule {
  id: string;
  organizationId: string;
  templateId: string | null;
  name: string;
  serviceDate: string;
  description: string | null;
  createdById: string;
  createdAt: string;
  createdBy: { id: string; displayName: string };
  template: { id: string; name: string; roleSlots: TemplateRoleSlot[] } | null;
  assignments: ShiftAssignment[];
}

export type SwapStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface ShiftSwapRequest {
  id: string;
  fromAssignmentId: string;
  toUserId: string;
  message: string | null;
  status: SwapStatus;
  respondedAt: string | null;
  createdAt: string;
  fromAssignment: {
    service: { id: string; name: string; serviceDate: string };
    post: { id: string; name: string; zone: string | null } | null;
    user: { id: string; displayName: string };
  };
  toUser: { id: string; displayName: string };
}
