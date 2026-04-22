export type SubscriptionTier = 'STARTER' | 'TEAM' | 'PRO';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export interface PlanLimits {
  maxLeadGroups: number;
  maxSubGroups: number;
  maxMembers: number;
  features: {
    ptt: boolean;
    alerts: boolean;
    location: boolean;
    incidents: boolean;
    multiCampus: boolean;
    scheduling: boolean;
    planningCenter: boolean; // add-on — enabled per-org regardless of tier
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
  limits: PlanLimits;
  usage: {
    members: number;
    leadGroups: number;
    subGroups: number;
  };
}
