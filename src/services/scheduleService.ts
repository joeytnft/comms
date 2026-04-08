import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { Post, ServiceSchedule, ServiceTemplate, TemplateRoleSlot, ShiftAssignment, ShiftSwapRequest } from '@/types';

export const scheduleService = {
  // Templates
  async listTemplates(): Promise<{ templates: ServiceTemplate[] }> {
    return apiClient.get(ENDPOINTS.SCHEDULE.TEMPLATES);
  },
  async createTemplate(data: { name: string; dayOfWeek: number; startTime: string; description?: string }): Promise<{ template: ServiceTemplate }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.TEMPLATES, data);
  },
  async updateTemplate(id: string, data: { name?: string; dayOfWeek?: number; startTime?: string; description?: string; isActive?: boolean }): Promise<{ template: ServiceTemplate }> {
    return apiClient.patch(ENDPOINTS.SCHEDULE.TEMPLATE(id), data);
  },
  async deleteTemplate(id: string): Promise<void> {
    return apiClient.delete(ENDPOINTS.SCHEDULE.TEMPLATE(id));
  },
  async generateFromTemplate(id: string, startDate: string, endDate: string): Promise<{ created: number; skipped: number }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.GENERATE(id), { startDate, endDate });
  },
  async addRoleSlot(templateId: string, data: { roleName: string; postId?: string; count?: number }): Promise<{ slot: TemplateRoleSlot }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.ROLE_SLOTS(templateId), data);
  },
  async removeRoleSlot(templateId: string, slotId: string): Promise<void> {
    return apiClient.delete(ENDPOINTS.SCHEDULE.ROLE_SLOT(templateId, slotId));
  },

  // Posts
  async listPosts(): Promise<{ posts: Post[] }> {
    return apiClient.get(ENDPOINTS.SCHEDULE.POSTS);
  },
  async createPost(data: { name: string; zone?: string; description?: string }): Promise<{ post: Post }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.POSTS, data);
  },
  async deletePost(id: string): Promise<void> {
    return apiClient.delete(ENDPOINTS.SCHEDULE.POST(id));
  },

  // Services
  async listServices(params?: { from?: string; to?: string; limit?: number }): Promise<{ services: ServiceSchedule[] }> {
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return apiClient.get(`${ENDPOINTS.SCHEDULE.SERVICES}${qs ? `?${qs}` : ''}`);
  },
  async getTodayServices(): Promise<{ services: ServiceSchedule[] }> {
    return apiClient.get(ENDPOINTS.SCHEDULE.TODAY);
  },
  async getService(id: string): Promise<{ service: ServiceSchedule }> {
    return apiClient.get(ENDPOINTS.SCHEDULE.SERVICE(id));
  },
  async createService(data: { name: string; serviceDate: string; description?: string }): Promise<{ service: ServiceSchedule }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.SERVICES, data);
  },
  async updateService(id: string, data: { name?: string; serviceDate?: string; description?: string }): Promise<{ service: ServiceSchedule }> {
    return apiClient.patch(ENDPOINTS.SCHEDULE.SERVICE(id), data);
  },
  async deleteService(id: string): Promise<void> {
    return apiClient.delete(ENDPOINTS.SCHEDULE.SERVICE(id));
  },

  // Assignments
  async assignUser(serviceId: string, data: { userId: string; postId?: string; role?: string; notes?: string }): Promise<{ assignment: ShiftAssignment }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.ASSIGNMENTS(serviceId), data);
  },
  async removeAssignment(serviceId: string, assignmentId: string): Promise<void> {
    return apiClient.delete(ENDPOINTS.SCHEDULE.REMOVE_ASSIGNMENT(serviceId, assignmentId));
  },
  async getMyAssignment(serviceId: string): Promise<{ assignment: ShiftAssignment | null }> {
    return apiClient.get(ENDPOINTS.SCHEDULE.MY_ASSIGNMENT(serviceId));
  },

  // Check-in
  async checkIn(assignmentId: string): Promise<{ assignment: ShiftAssignment }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.CHECK_IN(assignmentId), {});
  },
  async checkOut(assignmentId: string): Promise<{ assignment: ShiftAssignment }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.CHECK_OUT(assignmentId), {});
  },

  // Swap requests
  async requestSwap(assignmentId: string, data: { toUserId: string; message?: string }): Promise<{ swap: ShiftSwapRequest }> {
    return apiClient.post(ENDPOINTS.SCHEDULE.REQUEST_SWAP(assignmentId), data);
  },
  async respondToSwap(swapId: string, accept: boolean): Promise<{ swap: ShiftSwapRequest }> {
    return apiClient.patch(ENDPOINTS.SCHEDULE.RESPOND_SWAP(swapId), { accept });
  },
  async listSwapRequests(): Promise<{ swaps: ShiftSwapRequest[] }> {
    return apiClient.get(ENDPOINTS.SCHEDULE.SWAP_REQUESTS);
  },
};
