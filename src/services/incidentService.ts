import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { Incident, CreateIncidentData, UpdateIncidentData, IncidentPhoto } from '@/types';

interface IncidentListResponse {
  incidents: Incident[];
  nextCursor: string | null;
}

interface IncidentResponse {
  incident: Incident;
}

interface PhotoResponse {
  photo: IncidentPhoto;
}

export const incidentService = {
  async createIncident(data: CreateIncidentData): Promise<IncidentResponse> {
    return apiClient.post<IncidentResponse>(ENDPOINTS.INCIDENTS.CREATE, data);
  },

  async listIncidents(params?: { cursor?: string; limit?: number; status?: string }): Promise<IncidentListResponse> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return apiClient.get<IncidentListResponse>(`${ENDPOINTS.INCIDENTS.LIST}${qs ? `?${qs}` : ''}`);
  },

  async getIncident(id: string): Promise<IncidentResponse> {
    return apiClient.get<IncidentResponse>(ENDPOINTS.INCIDENTS.GET(id));
  },

  async updateIncident(id: string, data: UpdateIncidentData): Promise<IncidentResponse> {
    return apiClient.patch<IncidentResponse>(ENDPOINTS.INCIDENTS.UPDATE(id), data);
  },

  async addPhoto(incidentId: string, encryptedUrl: string): Promise<PhotoResponse> {
    return apiClient.post<PhotoResponse>(ENDPOINTS.INCIDENTS.UPLOAD_PHOTO(incidentId), { encryptedUrl });
  },
};
