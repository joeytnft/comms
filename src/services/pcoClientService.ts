import { apiClient } from '@/api/client';

export interface PcoStatus {
  connected: boolean;
  pcoOrgName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  scopes: string[];
}

export interface PcoPerson {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  avatarUrl: string | null;
}

export interface PcoServicePlan {
  id: string;
  serviceTypeId: string;
  serviceTypeName: string;
  title: string | null;
  seriesTitle: string | null;
  sortDate: string | null;
  totalLength: number;
}

export interface PcoServiceType {
  id: string;
  name: string;
}

export const pcoClientService = {
  async getStatus(): Promise<PcoStatus> {
    return apiClient.get<PcoStatus>('/integrations/pco/status');
  },

  async initiateConnect(): Promise<{ authorizeUrl: string }> {
    return apiClient.post<{ authorizeUrl: string }>('/integrations/pco/connect', {});
  },

  async disconnect(): Promise<void> {
    await apiClient.delete('/integrations/pco/disconnect');
  },

  async syncPeople(): Promise<{ synced: number; people: PcoPerson[] }> {
    return apiClient.post<{ synced: number; people: PcoPerson[] }>('/integrations/pco/sync/people', {});
  },

  async getPeople(): Promise<PcoPerson[]> {
    const { people } = await apiClient.get<{ people: PcoPerson[] }>('/integrations/pco/people');
    return people;
  },

  async syncServices(): Promise<{ serviceTypes: PcoServiceType[]; plans: PcoServicePlan[] }> {
    return apiClient.post<{ serviceTypes: PcoServiceType[]; plans: PcoServicePlan[] }>(
      '/integrations/pco/sync/services',
      {},
    );
  },

  async getPlans(): Promise<PcoServicePlan[]> {
    const { plans } = await apiClient.get<{ plans: PcoServicePlan[] }>('/integrations/pco/plans');
    return plans;
  },
};
