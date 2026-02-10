export type AlertLevel = 'ATTENTION' | 'WARNING' | 'EMERGENCY';

export interface AlertAcknowledgment {
  userId: string;
  acknowledgedAt: string;
}

export interface Alert {
  id: string;
  organizationId: string;
  triggeredById: string;
  triggeredBy: { id: string; displayName: string };
  level: AlertLevel;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  acknowledgments: AlertAcknowledgment[];
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
}

export interface TriggerAlertData {
  level: AlertLevel;
  message?: string;
  latitude?: number;
  longitude?: number;
}

export const ALERT_COLORS: Record<AlertLevel, string> = {
  ATTENTION: '#F59E0B', // Amber
  WARNING: '#F97316', // Orange
  EMERGENCY: '#EF4444', // Red
};

export const ALERT_LABELS: Record<AlertLevel, string> = {
  ATTENTION: 'Attention',
  WARNING: 'Warning',
  EMERGENCY: 'Emergency',
};
