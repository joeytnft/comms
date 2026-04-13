import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { Alert, TriggerAlertData } from '@/types';

interface AlertListResponse {
  alerts: Alert[];
  nextCursor: string | null;
}

interface AlertResponse {
  alert: Alert;
}

export const alertService = {
  async triggerAlert(data: TriggerAlertData): Promise<AlertResponse> {
    return apiClient.post<AlertResponse>(ENDPOINTS.ALERTS.TRIGGER, data);
  },

  async listAlerts(params?: { cursor?: string; limit?: number; active?: boolean; campusId?: string | null }): Promise<AlertListResponse> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.active !== undefined) query.set('active', String(params.active));
    if (params?.campusId) query.set('campusId', params.campusId);
    const qs = query.toString();
    return apiClient.get<AlertListResponse>(`${ENDPOINTS.ALERTS.LIST}${qs ? `?${qs}` : ''}`);
  },

  async acknowledgeAlert(id: string): Promise<AlertResponse> {
    return apiClient.post<AlertResponse>(ENDPOINTS.ALERTS.ACKNOWLEDGE(id), {});
  },

  async resolveAlert(id: string): Promise<AlertResponse> {
    return apiClient.post<AlertResponse>(ENDPOINTS.ALERTS.RESOLVE(id), {});
  },

  async deleteAlert(id: string): Promise<void> {
    return apiClient.delete<void>(ENDPOINTS.ALERTS.DELETE(id));
  },
};
