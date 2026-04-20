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
  rcProductId: string;  // RevenueCat product identifier
  limits: PlanLimits;
}

export const PLAN_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  FREE: {
    maxLeadGroups: 1,
    maxSubGroups: 3,
    maxMembers: 15,
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
  STARTER: {
    maxLeadGroups: 1,
    maxSubGroups: 5,
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
  TEAM: {
    maxLeadGroups: 2,
    maxSubGroups: -1,
    maxMembers: 100,
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
  PRO: {
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
  {
    tier: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    rcProductId: '',
    limits: PLAN_LIMITS.FREE,
  },
  {
    tier: 'STARTER',
    name: 'Starter',
    priceMonthly: 800,
    rcProductId: 'starter_monthly',
    limits: PLAN_LIMITS.STARTER,
  },
  {
    tier: 'TEAM',
    name: 'Team',
    priceMonthly: 2900,
    rcProductId: 'team_monthly',
    limits: PLAN_LIMITS.TEAM,
  },
  {
    tier: 'PRO',
    name: 'Ministry Pro',
    priceMonthly: 5900,
    rcProductId: 'pro_monthly',
    limits: PLAN_LIMITS.PRO,
  },
];

export const FREE_TRIAL_DAYS = 14;
