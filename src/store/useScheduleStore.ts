import { create } from 'zustand';
import { Post, ServiceSchedule, ServiceTemplate, ShiftSwapRequest } from '@/types';
import { scheduleService } from '@/services/scheduleService';

interface ScheduleState {
  templates: ServiceTemplate[];
  posts: Post[];
  todayServices: ServiceSchedule[];
  upcomingServices: ServiceSchedule[];
  currentService: ServiceSchedule | null;
  swapRequests: ShiftSwapRequest[];
  isLoading: boolean;
  error: string | null;

  fetchTemplates: () => Promise<void>;
  createTemplate: (data: { name: string; dayOfWeek: number; startTime: string; description?: string }) => Promise<ServiceTemplate>;
  updateTemplate: (id: string, data: { name?: string; dayOfWeek?: number; startTime?: string; description?: string; isActive?: boolean }) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  generateFromTemplate: (id: string, startDate: string, endDate: string) => Promise<{ created: number; skipped: number }>;
  addRoleSlot: (templateId: string, data: { roleName: string; postId?: string; count?: number }) => Promise<void>;
  removeRoleSlot: (templateId: string, slotId: string) => Promise<void>;

  fetchPosts: () => Promise<void>;
  createPost: (data: { name: string; zone?: string; description?: string }) => Promise<void>;
  deletePost: (id: string) => Promise<void>;

  fetchTodayServices: () => Promise<void>;
  fetchUpcomingServices: () => Promise<void>;
  fetchService: (id: string) => Promise<void>;
  createService: (data: { name: string; serviceDate: string; description?: string }) => Promise<ServiceSchedule>;
  updateService: (id: string, data: { name?: string; serviceDate?: string; description?: string }) => Promise<void>;
  deleteService: (id: string) => Promise<void>;

  assignUser: (serviceId: string, data: { userId: string; postId?: string; role?: string; notes?: string }) => Promise<void>;
  removeAssignment: (serviceId: string, assignmentId: string) => Promise<void>;

  checkIn: (assignmentId: string) => Promise<void>;
  checkOut: (assignmentId: string) => Promise<void>;

  fetchSwapRequests: () => Promise<void>;
  requestSwap: (assignmentId: string, toUserId: string, message?: string) => Promise<void>;
  respondToSwap: (swapId: string, accept: boolean) => Promise<void>;

  clearCurrentService: () => void;
  clearError: () => void;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  templates: [],
  posts: [],
  todayServices: [],
  upcomingServices: [],
  currentService: null,
  swapRequests: [],
  isLoading: false,
  error: null,

  fetchTemplates: async () => {
    try {
      const { templates } = await scheduleService.listTemplates();
      set({ templates });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load templates' });
    }
  },

  createTemplate: async (data) => {
    const { template } = await scheduleService.createTemplate(data);
    set((s) => ({ templates: [...s.templates, template] }));
    return template;
  },

  updateTemplate: async (id, data) => {
    const { template } = await scheduleService.updateTemplate(id, data);
    set((s) => ({ templates: s.templates.map((t) => t.id === id ? template : t) }));
  },

  deleteTemplate: async (id) => {
    await scheduleService.deleteTemplate(id);
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
  },

  generateFromTemplate: async (id, startDate, endDate) => {
    const result = await scheduleService.generateFromTemplate(id, startDate, endDate);
    // Refresh upcoming after generation
    await get().fetchUpcomingServices();
    return result;
  },

  addRoleSlot: async (templateId, data) => {
    const { slot } = await scheduleService.addRoleSlot(templateId, data);
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === templateId ? { ...t, roleSlots: [...t.roleSlots, slot] } : t
      ),
    }));
  },

  removeRoleSlot: async (templateId, slotId) => {
    await scheduleService.removeRoleSlot(templateId, slotId);
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === templateId ? { ...t, roleSlots: t.roleSlots.filter((sl) => sl.id !== slotId) } : t
      ),
    }));
  },

  fetchPosts: async () => {
    try {
      const { posts } = await scheduleService.listPosts();
      set({ posts });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load posts' });
    }
  },

  createPost: async (data) => {
    const { post } = await scheduleService.createPost(data);
    set((s) => ({ posts: [...s.posts, post] }));
  },

  deletePost: async (id) => {
    await scheduleService.deletePost(id);
    set((s) => ({ posts: s.posts.filter((p) => p.id !== id) }));
  },

  fetchTodayServices: async () => {
    set({ isLoading: true, error: null });
    try {
      const { services } = await scheduleService.getTodayServices();
      set({ todayServices: services, isLoading: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load services', isLoading: false });
    }
  },

  fetchUpcomingServices: async () => {
    set({ isLoading: true, error: null });
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 90);
      const { services } = await scheduleService.listServices({
        from: today.toISOString(),
        to: nextWeek.toISOString(),
        limit: 30,
      });
      set({ upcomingServices: services, isLoading: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load upcoming services', isLoading: false });
    }
  },

  fetchService: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { service } = await scheduleService.getService(id);
      set({ currentService: service, isLoading: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load service', isLoading: false });
    }
  },

  createService: async (data) => {
    const { service } = await scheduleService.createService(data);
    set((s) => ({ upcomingServices: [...s.upcomingServices, service].sort(
      (a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime()
    )}));
    return service;
  },

  updateService: async (id, data) => {
    const { service } = await scheduleService.updateService(id, data);
    const update = (list: ServiceSchedule[]) => list.map((s) => s.id === id ? service : s);
    set((s) => ({
      upcomingServices: update(s.upcomingServices),
      todayServices: update(s.todayServices),
      currentService: s.currentService?.id === id ? service : s.currentService,
    }));
  },

  deleteService: async (id) => {
    await scheduleService.deleteService(id);
    set((s) => ({
      upcomingServices: s.upcomingServices.filter((sv) => sv.id !== id),
      todayServices: s.todayServices.filter((sv) => sv.id !== id),
      currentService: s.currentService?.id === id ? null : s.currentService,
    }));
  },

  assignUser: async (serviceId, data) => {
    const { assignment } = await scheduleService.assignUser(serviceId, data);
    set((s) => {
      if (s.currentService?.id !== serviceId) return s;
      const existing = s.currentService.assignments.find((a) => a.id === assignment.id);
      const assignments = existing
        ? s.currentService.assignments.map((a) => a.id === assignment.id ? assignment : a)
        : [...s.currentService.assignments, assignment];
      return { currentService: { ...s.currentService, assignments } };
    });
  },

  removeAssignment: async (serviceId, assignmentId) => {
    await scheduleService.removeAssignment(serviceId, assignmentId);
    set((s) => {
      if (s.currentService?.id !== serviceId) return s;
      return {
        currentService: {
          ...s.currentService,
          assignments: s.currentService.assignments.filter((a) => a.id !== assignmentId),
        },
      };
    });
  },

  checkIn: async (assignmentId) => {
    const { assignment } = await scheduleService.checkIn(assignmentId);
    set((s) => {
      if (!s.currentService) return s;
      return {
        currentService: {
          ...s.currentService,
          assignments: s.currentService.assignments.map((a) => a.id === assignmentId ? assignment : a),
        },
      };
    });
  },

  checkOut: async (assignmentId) => {
    const { assignment } = await scheduleService.checkOut(assignmentId);
    set((s) => {
      if (!s.currentService) return s;
      return {
        currentService: {
          ...s.currentService,
          assignments: s.currentService.assignments.map((a) => a.id === assignmentId ? assignment : a),
        },
      };
    });
  },

  fetchSwapRequests: async () => {
    const { swaps } = await scheduleService.listSwapRequests();
    set({ swapRequests: swaps });
  },

  requestSwap: async (assignmentId, toUserId, message) => {
    await scheduleService.requestSwap(assignmentId, { toUserId, message });
    await get().fetchSwapRequests();
  },

  respondToSwap: async (swapId, accept) => {
    await scheduleService.respondToSwap(swapId, accept);
    set((s) => ({
      swapRequests: s.swapRequests.map((sw) =>
        sw.id === swapId ? { ...sw, status: accept ? 'ACCEPTED' : 'DECLINED' } : sw
      ),
    }));
    // Refresh current service if open (assignments may have changed)
    const { currentService } = get();
    if (currentService) get().fetchService(currentService.id);
  },

  clearCurrentService: () => set({ currentService: null }),
  clearError: () => set({ error: null }),
}));
