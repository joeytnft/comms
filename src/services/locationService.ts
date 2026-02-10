import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { TeamMemberLocation } from '@/types';

interface TeamLocationsResponse {
  locations: TeamMemberLocation[];
}

export const locationService = {
  async updateLocation(latitude: number, longitude: number): Promise<{ status: string }> {
    return apiClient.post<{ status: string }>(ENDPOINTS.LOCATION.UPDATE, { latitude, longitude });
  },

  async getTeamLocations(): Promise<TeamLocationsResponse> {
    return apiClient.get<TeamLocationsResponse>(ENDPOINTS.LOCATION.TEAM);
  },
};
