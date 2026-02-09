export type AlertLevel = 'attention' | 'warning' | 'emergency';

export interface Alert {
  id: string;
  organizationId: string;
  triggeredBy: string;
  triggeredByName: string;
  level: AlertLevel;
  message?: string;
  latitude?: number;
  longitude?: number;
  acknowledgedBy: string[]; // User IDs
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface TriggerAlertData {
  level: AlertLevel;
  message?: string;
  latitude?: number;
  longitude?: number;
}

export const ALERT_COLORS: Record<AlertLevel, string> = {
  attention: '#F59E0B', // Amber
  warning: '#F97316', // Orange
  emergency: '#EF4444', // Red
};

export const ALERT_LABELS: Record<AlertLevel, string> = {
  attention: 'ATTENTION',
  warning: 'WARNING',
  emergency: 'EMERGENCY',
};
