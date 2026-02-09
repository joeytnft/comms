import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { OrganizationSubscription, SubscriptionPlan } from '@/types/subscription';

interface SubscriptionResponse {
  subscription: OrganizationSubscription;
}

interface PlansResponse {
  plans: SubscriptionPlan[];
}

export const subscriptionService = {
  async getSubscription(): Promise<SubscriptionResponse> {
    return apiClient.get<SubscriptionResponse>(ENDPOINTS.SUBSCRIPTION.GET);
  },

  async getPlans(): Promise<PlansResponse> {
    return apiClient.get<PlansResponse>(ENDPOINTS.SUBSCRIPTION.PLANS);
  },
};
