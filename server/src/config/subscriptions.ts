import { SubscriptionTier } from '@prisma/client';

export interface PlanLimits {
  maxGroups: number;   // -1 = unlimited
  maxMembers: number;  // -1 = unlimited
  features: {
    ptt: boolean;
    alerts: boolean;
    location: boolean;
    incidents: boolean;
    multiCampus: boolean;
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
    maxGroups: 1,
    maxMembers: 5,
    features: {
      ptt: false,
      alerts: false,
      location: false,
      incidents: false,
      multiCampus: false,
    },
  },
  TEAM: {
    maxGroups: -1,
    maxMembers: 25,
    features: {
      ptt: true,
      alerts: true,
      location: false,
      incidents: false,
      multiCampus: false,
    },
  },
  PRO: {
    maxGroups: -1,
    maxMembers: -1,
    features: {
      ptt: true,
      alerts: true,
      location: true,
      incidents: true,
      multiCampus: true,
    },
  },
};

export const PLANS: PlanDefinition[] = [
  { tier: 'FREE', name: 'Free', priceMonthly: 0, limits: PLAN_LIMITS.FREE },
  { tier: 'TEAM', name: 'Team', priceMonthly: 999, limits: PLAN_LIMITS.TEAM },
  { tier: 'PRO', name: 'Pro', priceMonthly: 1999, limits: PLAN_LIMITS.PRO },
];

export const FREE_TRIAL_DAYS = 14;
