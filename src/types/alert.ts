export type AlertLevel = 'ATTENTION' | 'WARNING' | 'EMERGENCY';

export type AlertTypeKey =
  | 'MEDICAL'
  | 'SUSPICIOUS_PERSON'
  | 'CHILD_SAFETY'
  | 'FIGHT'
  | 'FIRE'
  | 'LOCKDOWN'
  | 'WEATHER';

export interface AlertTypeDef {
  label: string;
  description: string;
  color: string;
  textColor: string;
  emoji: string;
  defaultLevel: AlertLevel;
}

export const ALERT_TYPE_DEFS: Record<AlertTypeKey, AlertTypeDef> = {
  MEDICAL: {
    label: 'Medical',
    description: 'Injury, illness, or medical emergency',
    color: '#EF4444',
    textColor: '#FFFFFF',
    emoji: '🏥',
    defaultLevel: 'EMERGENCY',
  },
  SUSPICIOUS_PERSON: {
    label: 'Suspicious Person',
    description: 'Unknown or threatening individual',
    color: '#F59E0B',
    textColor: '#FFFFFF',
    emoji: '👁',
    defaultLevel: 'WARNING',
  },
  CHILD_SAFETY: {
    label: 'Child Safety',
    description: 'Missing child or child in danger',
    color: '#F97316',
    textColor: '#FFFFFF',
    emoji: '🧒',
    defaultLevel: 'EMERGENCY',
  },
  FIGHT: {
    label: 'Fight / Disturbance',
    description: 'Physical altercation or unruly behavior',
    color: '#8B5CF6',
    textColor: '#FFFFFF',
    emoji: '⚡',
    defaultLevel: 'WARNING',
  },
  FIRE: {
    label: 'Fire / Evacuation',
    description: 'Fire detected or building evacuation needed',
    color: '#DC2626',
    textColor: '#FFFFFF',
    emoji: '🔥',
    defaultLevel: 'EMERGENCY',
  },
  LOCKDOWN: {
    label: 'Lockdown',
    description: 'Secure all rooms — do not allow entry or exit',
    color: '#111827',
    textColor: '#FFFFFF',
    emoji: '🔒',
    defaultLevel: 'EMERGENCY',
  },
  WEATHER: {
    label: 'Weather Emergency',
    description: 'Severe weather — seek shelter immediately',
    color: '#2563EB',
    textColor: '#FFFFFF',
    emoji: '⛈',
    defaultLevel: 'WARNING',
  },
};

export const ALERT_TYPE_KEYS = Object.keys(ALERT_TYPE_DEFS) as AlertTypeKey[];

export interface CustomAlertType {
  id: string;
  label: string;
  description: string;
  color: string;
  emoji: string;
  defaultLevel: AlertLevel;
}

export const CUSTOM_ALERT_TYPES_KEY = 'guardian_custom_alert_types';

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
  alertType: AlertTypeKey | null;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  priorityTone: boolean;
  photoUrl: string | null;
  acknowledgments: AlertAcknowledgment[];
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
  targetGroups: { group: { id: string; name: string } }[];
}

export interface TriggerAlertData {
  level: AlertLevel;
  alertType?: AlertTypeKey;
  message?: string;
  latitude?: number;
  longitude?: number;
  priorityTone?: boolean;
  photoUrl?: string;
  groupIds?: string[];
}

// Legacy level colors (used as fallback)
export const ALERT_COLORS: Record<AlertLevel, string> = {
  ATTENTION: '#F59E0B',
  WARNING: '#F97316',
  EMERGENCY: '#EF4444',
};

export const ALERT_LABELS: Record<AlertLevel, string> = {
  ATTENTION: 'Attention',
  WARNING: 'Warning',
  EMERGENCY: 'Emergency',
};
