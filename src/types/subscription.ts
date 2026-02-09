export type SubscriptionTier = 'FREE' | 'TEAM' | 'PRO';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export interface PlanLimits {
  maxGroups: number;
  maxMembers: number;
  features: {
    ptt: boolean;
    alerts: boolean;
    location: boolean;
    incidents: boolean;
    multiCampus: boolean;
  };
}

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  priceMonthly: number; // cents
  limits: PlanLimits;
}

export interface OrganizationSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  limits: PlanLimits;
  usage: {
    members: number;
    groups: number;
  };
}
