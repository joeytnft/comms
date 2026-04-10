// API Endpoint definitions
// All endpoints are relative to the base URL configured in the API client

export const ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    VERIFY_PIN: '/auth/verify-pin',
  },

  // Users
  USERS: {
    ME: '/users/me',
    UPDATE_PROFILE: '/users/me',
    UPDATE_PUBLIC_KEY: '/users/me/public-key',
    UPDATE_PUSH_TOKEN: '/users/me/push-token',
    GET_USER: (id: string) => `/users/${id}`,
  },

  // Organizations
  ORGANIZATIONS: {
    GET: '/organizations',
    CREATE: '/organizations',
    GENERATE_CODE: '/organizations/invite-code',
  },

  // Groups
  GROUPS: {
    LIST: '/groups',
    CREATE: '/groups',
    GET: (id: string) => `/groups/${id}`,
    UPDATE: (id: string) => `/groups/${id}`,
    DELETE: (id: string) => `/groups/${id}`,
    MEMBERS: (id: string) => `/groups/${id}/members`,
    ADD_MEMBER: (id: string) => `/groups/${id}/members`,
    REMOVE_MEMBER: (groupId: string, userId: string) =>
      `/groups/${groupId}/members/${userId}`,
    HIERARCHY: '/groups/hierarchy',
    GENERATE_INVITE: (id: string) => `/groups/${id}/invite`,
    REVOKE_INVITE: (id: string) => `/groups/${id}/invite`,
    JOIN_BY_INVITE: '/groups/join',
  },

  // Messages
  MESSAGES: {
    LIST: (groupId: string) => `/groups/${groupId}/messages`,
    SEND: (groupId: string) => `/groups/${groupId}/messages`,
    MARK_READ: (groupId: string) => `/groups/${groupId}/messages/read`,
  },

  // PTT
  PTT: {
    TOKEN: (groupId: string) => `/ptt/${groupId}/token`,
    PARTICIPANTS: (groupId: string) => `/ptt/${groupId}/participants`,
  },

  // Upload
  UPLOAD: '/upload',

  // Alerts
  ALERTS: {
    LIST: '/alerts',
    TRIGGER: '/alerts',
    ACKNOWLEDGE: (id: string) => `/alerts/${id}/acknowledge`,
    RESOLVE: (id: string) => `/alerts/${id}/resolve`,
    DELETE: (id: string) => `/alerts/${id}`,
  },

  // Incidents
  INCIDENTS: {
    LIST: '/incidents',
    CREATE: '/incidents',
    GET: (id: string) => `/incidents/${id}`,
    UPDATE: (id: string) => `/incidents/${id}`,
    UPLOAD_PHOTO: (id: string) => `/incidents/${id}/photos`,
  },

  // Schedule
  SCHEDULE: {
    TEMPLATES: '/schedule/templates',
    TEMPLATE: (id: string) => `/schedule/templates/${id}`,
    GENERATE: (id: string) => `/schedule/templates/${id}/generate`,
    ROLE_SLOTS: (templateId: string) => `/schedule/templates/${templateId}/role-slots`,
    ROLE_SLOT: (templateId: string, slotId: string) => `/schedule/templates/${templateId}/role-slots/${slotId}`,
    POSTS: '/schedule/posts',
    POST: (id: string) => `/schedule/posts/${id}`,
    SERVICES: '/schedule/services',
    TODAY: '/schedule/services/today',
    SERVICE: (id: string) => `/schedule/services/${id}`,
    MY_ASSIGNMENT: (serviceId: string) => `/schedule/services/${serviceId}/my-assignment`,
    ASSIGNMENTS: (serviceId: string) => `/schedule/services/${serviceId}/assignments`,
    REMOVE_ASSIGNMENT: (serviceId: string, assignmentId: string) => `/schedule/services/${serviceId}/assignments/${assignmentId}`,
    CHECK_IN: (assignmentId: string) => `/schedule/check-in/${assignmentId}`,
    CHECK_OUT: (assignmentId: string) => `/schedule/check-out/${assignmentId}`,
    SWAP_REQUESTS: '/schedule/swap-requests',
    REQUEST_SWAP: (assignmentId: string) => `/schedule/swap-requests/${assignmentId}`,
    RESPOND_SWAP: (id: string) => `/schedule/swap-requests/${id}/respond`,
  },

  // Campuses (Enterprise only)
  CAMPUSES: {
    LIST: '/campuses',
    CREATE: '/campuses',
    GET: (id: string) => `/campuses/${id}`,
    UPDATE: (id: string) => `/campuses/${id}`,
    DELETE: (id: string) => `/campuses/${id}`,
    MEMBERS: (id: string) => `/campuses/${id}/members`,
    ASSIGN_USER: (id: string) => `/campuses/${id}/members`,
    REMOVE_USER: (id: string, userId: string) => `/campuses/${id}/members/${userId}`,
    ORG_MEMBERS: '/campuses/org-members',
  },

  // Subscription
  SUBSCRIPTION: {
    GET: '/subscription',
    PLANS: '/subscription/plans',
  },

  // Location
  LOCATION: {
    UPDATE: '/location',
    TEAM: '/location/team',
  },

  // Response Plans
  RESPONSE_PLANS: {
    LIST: '/response-plans',
    CREATE: '/response-plans',
    UPDATE: (id: string) => `/response-plans/${id}`,
    DELETE: (id: string) => `/response-plans/${id}`,
  },
} as const;
