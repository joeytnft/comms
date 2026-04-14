import { SubscriptionTier } from '@prisma/client';

export interface PlanLimits {
  maxLeadGroups: number;  // -1 = unlimited
  maxSubGroups: number;   // -1 = unlimited
  maxMembers: number;     // -1 = unlimited
  features: {
    ptt: boolean;
    alerts: boolean;
    location: boolean;
    incidents: boolean;
    multiCampus: boolean;
    scheduling: boolean;
    planningCenter: boolean; // add-on — overridden per-org by pcoIntegrationEnabled
  };
}

export interface PlanDefinition {
  tier: SubscriptionTier;
  name: string;
  priceMonthly: number; // cents
  limits: PlanLimits;
}

export const PLAN_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  FREE: {
    maxLeadGroups: 1,
    maxSubGroups: 1,
    maxMembers: 20,
    features: {
      ptt: true,
      alerts: true,
      location: true,
      incidents: true,
      multiCampus: false,
      scheduling: false,
      planningCenter: false,
    },
  },
  BASIC: {
    maxLeadGroups: 2,
    maxSubGroups: -1,
    maxMembers: 50,
    features: {
      ptt: true,
      alerts: true,
      location: true,
      incidents: true,
      multiCampus: false,
      scheduling: true,
      planningCenter: false,
    },
  },
  STANDARD: {
    maxLeadGroups: 5,
    maxSubGroups: -1,
    maxMembers: -1,
    features: {
      ptt: true,
      alerts: true,
      location: true,
      incidents: true,
      multiCampus: false,
      scheduling: true,
      planningCenter: false,
    },
  },
  ENTERPRISE: {
    maxLeadGroups: -1,
    maxSubGroups: -1,
    maxMembers: -1,
    features: {
      ptt: true,
      alerts: true,
      location: true,
      incidents: true,
      multiCampus: true,
      scheduling: true,
      planningCenter: false,
    },
  },
};

export const PLANS: PlanDefinition[] = [
  { tier: 'FREE', name: 'Free', priceMonthly: 800, limits: PLAN_LIMITS.FREE },
  { tier: 'BASIC', name: 'Basic', priceMonthly: 2000, limits: PLAN_LIMITS.BASIC },
  { tier: 'STANDARD', name: 'Standard', priceMonthly: 4000, limits: PLAN_LIMITS.STANDARD },
  { tier: 'ENTERPRISE', name: 'Enterprise', priceMonthly: 6000, limits: PLAN_LIMITS.ENTERPRISE },
];

export const FREE_TRIAL_DAYS = 14;
