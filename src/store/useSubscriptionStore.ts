import { create } from 'zustand';
import { CustomerInfo } from 'react-native-purchases';
import { subscriptionService } from '@/services/subscriptionService';
import { revenueCatService } from '@/services/revenueCatService';
import { OrganizationSubscription, SubscriptionPlan, SubscriptionTier } from '@/types/subscription';

interface SubscriptionState {
  // Backend subscription state
  subscription: OrganizationSubscription | null;
  plans: SubscriptionPlan[];
  isLoading: boolean;
  error: string | null;

  // RevenueCat state
  customerInfo: CustomerInfo | null;
  isPro: boolean;
  isPaywallLoading: boolean;

  // Actions
  fetchSubscription: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchCustomerInfo: () => Promise<void>;
  presentPaywall: () => Promise<boolean>;
  presentCustomerCenter: () => Promise<void>;
  restorePurchases: () => Promise<boolean>;
  clear: () => void;

  // Computed helpers
  canUseFeature: (feature: keyof OrganizationSubscription['limits']['features']) => boolean;
  tierLabel: () => string;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  STARTER: 'Starter',
  TEAM: 'Team',
  PRO: 'Ministry Pro',
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  plans: [],
  isLoading: false,
  error: null,
  customerInfo: null,
  isPro: false,
  isPaywallLoading: false,

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

  fetchCustomerInfo: async () => {
    try {
      const customerInfo = await revenueCatService.getCustomerInfo();
      if (!customerInfo) return;
      set({
        customerInfo,
        isPro: revenueCatService.hasAnyPaidEntitlement(customerInfo),
      });
    } catch {
      // Non-critical — user may be offline or SDK not yet configured
    }
  },

  presentPaywall: async () => {
    set({ isPaywallLoading: true });
    try {
      const purchased = await revenueCatService.presentPaywall();
      if (purchased) {
        const customerInfo = await revenueCatService.getCustomerInfo();
        if (customerInfo) {
          set({
            customerInfo,
            isPro: revenueCatService.hasAnyPaidEntitlement(customerInfo),
          });
        }
      }
      return purchased;
    } finally {
      set({ isPaywallLoading: false });
    }
  },

  presentCustomerCenter: async () => {
    await revenueCatService.presentCustomerCenter();
    // Refresh customer info after Customer Center is dismissed (user may have changed plan)
    const customerInfo = await revenueCatService.getCustomerInfo();
    if (customerInfo) {
      set({
        customerInfo,
        isPro: revenueCatService.hasAnyPaidEntitlement(customerInfo),
      });
    }
  },

  restorePurchases: async () => {
    try {
      const customerInfo = await revenueCatService.restorePurchases();
      if (!customerInfo) return false;
      const isPro = revenueCatService.hasAnyPaidEntitlement(customerInfo);
      set({ customerInfo, isPro });
      return isPro;
    } catch {
      return false;
    }
  },

  clear: () => {
    set({
      subscription: null,
      plans: [],
      isLoading: false,
      error: null,
      customerInfo: null,
      isPro: false,
    });
  },

  canUseFeature: (feature) => {
    const { subscription } = get();
    if (!subscription) return false;
    return subscription.status === 'ACTIVE' && subscription.limits.features[feature];
  },

  tierLabel: () => {
    const { subscription } = get();
    if (!subscription) return '';
    return TIER_LABELS[subscription.tier] || subscription.tier;
  },
}));
