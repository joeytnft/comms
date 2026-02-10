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
    TOKEN: (groupId: string) => `/ptt/${groupId}/token`, // Get LiveKit token
  },

  // Alerts
  ALERTS: {
    LIST: '/alerts',
    TRIGGER: '/alerts',
    ACKNOWLEDGE: (id: string) => `/alerts/${id}/acknowledge`,
    RESOLVE: (id: string) => `/alerts/${id}/resolve`,
  },

  // Incidents
  INCIDENTS: {
    LIST: '/incidents',
    CREATE: '/incidents',
    GET: (id: string) => `/incidents/${id}`,
    UPDATE: (id: string) => `/incidents/${id}`,
    UPLOAD_PHOTO: (id: string) => `/incidents/${id}/photos`,
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
} as const;
