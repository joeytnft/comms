export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  organizationId: string;
  reportedBy: string;
  reportedByName: string;
  title: string;
  encryptedDetails: string; // E2E encrypted
  severity: IncidentSeverity;
  status: IncidentStatus;
  latitude?: number;
  longitude?: number;
  photos: string[]; // Encrypted photo URLs
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface CreateIncidentData {
  title: string;
  details: string;
  severity: IncidentSeverity;
  latitude?: number;
  longitude?: number;
  photos?: string[]; // Base64 encoded
}
