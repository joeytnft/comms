import { create } from 'zustand';
import { subscriptionService } from '@/services/subscriptionService';
import { OrganizationSubscription, SubscriptionPlan, SubscriptionTier } from '@/types/subscription';

interface SubscriptionState {
  subscription: OrganizationSubscription | null;
  plans: SubscriptionPlan[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSubscription: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  clear: () => void;

  // Computed helpers
  canUseFeature: (feature: keyof OrganizationSubscription['limits']['features']) => boolean;
  isTrialExpired: () => boolean;
  daysLeftInTrial: () => number;
  tierLabel: () => string;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  STANDARD: 'Standard',
  ENTERPRISE: 'Enterprise',
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  plans: [],
  isLoading: false,
  error: null,

  fetchSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      const { subscription } = await subscriptionService.getSubscription();
      set({ subscription, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch subscription';
      set({ error: message, isLoading: false });
    }
  },

  fetchPlans: async () => {
    try {
      const { plans } = await subscriptionService.getPlans();
      set({ plans });
    } catch {
      // Plans are non-critical, fail silently
    }
  },

  clear: () => {
    set({ subscription: null, plans: [], isLoading: false, error: null });
  },

  canUseFeature: (feature) => {
    const { subscription } = get();
    if (!subscription) return false;
    const isActive = subscription.status === 'ACTIVE' ||
      (subscription.status === 'TRIALING' && !get().isTrialExpired());
    return isActive && subscription.limits.features[feature];
  },

  isTrialExpired: () => {
    const { subscription } = get();
    if (!subscription || subscription.status !== 'TRIALING') return false;
    if (!subscription.trialEndsAt) return true;
    return new Date(subscription.trialEndsAt) < new Date();
  },

  daysLeftInTrial: () => {
    const { subscription } = get();
    if (!subscription?.trialEndsAt) return 0;
    const diff = new Date(subscription.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  },

  tierLabel: () => {
    const { subscription } = get();
    if (!subscription) return 'Free';
    return TIER_LABELS[subscription.tier] || subscription.tier;
  },
}));
