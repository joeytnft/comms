export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface IncidentPhoto {
  id: string;
  encryptedUrl: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  organizationId: string;
  reportedById: string;
  reportedBy: { id: string; displayName: string };
  title: string;
  encryptedDetails: string; // E2E encrypted
  severity: IncidentSeverity;
  status: IncidentStatus;
  latitude: number | null;
  longitude: number | null;
  photos: IncidentPhoto[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface CreateIncidentData {
  title: string;
  encryptedDetails: string;
  severity: IncidentSeverity;
  latitude?: number;
  longitude?: number;
}

export interface UpdateIncidentData {
  title?: string;
  encryptedDetails?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
}

export const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  LOW: '#10B981',
  MEDIUM: '#F59E0B',
  HIGH: '#F97316',
  CRITICAL: '#EF4444',
};

export const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};
