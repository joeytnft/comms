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
  pcoId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  avatarUrl: string | null;
  gatherSafeUser: { id: string; accountStatus: string } | null;
}

export interface PcoTeam {
  id: string;
  pcoId: string;
  serviceTypeId: string;
  serviceTypeName: string;
  name: string;
  groupId: string | null;
  linkedGroupName: string | null;
  memberCount: number;
}

export interface PcoServicePlan {
  id: string;
  pcoId: string;
  serviceTypeId: string;
  serviceTypeName: string;
  title: string | null;
  seriesTitle: string | null;
  sortDate: string | null;
  totalLength: number;
}

export interface PcoScheduledPerson {
  id: string;
  pcoPlanId: string;
  pcoPersonId: string;
  pcoTeamId: string | null;
  status: string; // C=Confirmed D=Declined U=Unconfirmed
  position: string | null;
  person: { pcoId: string; name: string; avatarUrl: string | null } | null;
  teamName: string | null;
}

export interface PcoServiceType {
  id: string;
  name: string;
}

export interface PeopleSyncResult {
  synced: number;
  invited: number;
  linked: number;
  skipped: number;
  people: PcoPerson[];
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

  async syncPeople(): Promise<PeopleSyncResult> {
    return apiClient.post<PeopleSyncResult>('/integrations/pco/sync/people', {});
  },

  async getPeople(): Promise<PcoPerson[]> {
    const { people } = await apiClient.get<{ people: PcoPerson[] }>('/integrations/pco/people');
    return people;
  },

  async syncTeams(): Promise<{ serviceTypes: number; teams: number; members: number }> {
    return apiClient.post('/integrations/pco/sync/teams', {});
  },

  async getTeams(): Promise<PcoTeam[]> {
    const { teams } = await apiClient.get<{ teams: PcoTeam[] }>('/integrations/pco/teams');
    return teams;
  },

  async linkTeam(pcoTeamId: string, groupId: string | null): Promise<void> {
    await apiClient.post(`/integrations/pco/teams/${pcoTeamId}/link`, { groupId });
  },

  async syncServices(): Promise<{ serviceTypes: PcoServiceType[]; plans: PcoServicePlan[] }> {
    return apiClient.post('/integrations/pco/sync/services', {});
  },

  async getPlans(): Promise<PcoServicePlan[]> {
    const { plans } = await apiClient.get<{ plans: PcoServicePlan[] }>('/integrations/pco/plans');
    return plans;
  },

  async getPlanSchedule(pcoPlanId: string): Promise<{ plan: PcoServicePlan; scheduled: PcoScheduledPerson[] }> {
    return apiClient.get(`/integrations/pco/plans/${pcoPlanId}/schedule`);
  },
};
