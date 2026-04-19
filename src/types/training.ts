export type SignupStatus = 'CONFIRMED' | 'CANCELLED' | 'WAITLISTED';

export interface TrainingGroupTarget {
  id: string;
  groupId: string;
  group: {
    id: string;
    name: string;
    iconColor: string | null;
  };
}

export interface TrainingSignup {
  id: string;
  trainingEventId: string;
  userId: string;
  status: SignupStatus;
  notes: string | null;
  signedUpAt: string;
  user?: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    email?: string;
  };
}

export interface TrainingEvent {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: string;
  endDate: string | null;
  maxAttendees: number | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  creator: { id: string; displayName: string };
  groupTargets: TrainingGroupTarget[];
  signups?: TrainingSignup[];
  confirmedCount?: number;
  mySignup?: TrainingSignup | null;
}

export interface CreateTrainingData {
  title: string;
  description?: string;
  location?: string;
  startDate: string;
  endDate?: string;
  maxAttendees?: number;
  groupIds?: string[];
}

export interface UpdateTrainingData {
  title?: string;
  description?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  maxAttendees?: number | null;
  isActive?: boolean;
  groupIds?: string[];
}
