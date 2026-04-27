// App-wide constants

export const APP_NAME = 'GatherSafe';
export const APP_VERSION = '0.1.0';

// API
export const API_TIMEOUT = 30000; // 30 seconds

// Socket reconnect tuning. We use true exponential backoff with jitter via
// socket.io-client's built-in reconnection logic. There is intentionally no
// upper bound on attempts — the previous 10-attempt cap meant a 20-second
// outage left users permanently disconnected until they manually reopened
// the app, which was a recurring user complaint.
export const SOCKET_RECONNECT_ATTEMPTS = Infinity;
export const SOCKET_RECONNECT_DELAY = 1000;        // initial backoff (ms)
export const SOCKET_RECONNECT_DELAY_MAX = 30000;   // cap each individual wait
export const SOCKET_RECONNECT_JITTER = 0.5;        // ±50% randomisation

// Auth
export const ACCESS_TOKEN_KEY = 'guardian_access_token';
export const REFRESH_TOKEN_KEY = 'guardian_refresh_token';
export const USER_KEY = 'guardian_user';
export const PIN_KEY = 'guardian_pin';

// Encryption
export const KEY_ALGORITHM = 'AES-GCM';
export const KEY_LENGTH = 256;

// PTT
export const PTT_MAX_TRANSMIT_DURATION = 60000; // 60 seconds max
export const PTT_AUDIO_SAMPLE_RATE = 16000;
export const PTT_AUDIO_CHANNELS = 1;

// Location
export const LOCATION_UPDATE_INTERVAL = 2000; // 2 seconds
export const LOCATION_DISTANCE_FILTER = 2; // meters
export const GEOFENCE_DEFAULT_RADIUS = 200; // meters
export const LOCATION_SHARING_KEY = 'guardian_location_sharing'; // persisted sharing preference

// Messages
export const MESSAGE_PAGE_SIZE = 50;
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

// Groups
export const MAX_GROUP_NAME_LENGTH = 50;
export const MAX_GROUP_DESCRIPTION_LENGTH = 200;
export const GROUP_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
  '#14B8A6', '#06B6D4', '#84CC16', '#F43F5E',
] as const;

// Alerts
export const ALERT_AUTO_DISMISS_ATTENTION = 30000; // 30s
export const ALERT_AUTO_DISMISS_WARNING = 0; // Never
export const ALERT_AUTO_DISMISS_EMERGENCY = 0; // Never
export const PANIC_BUTTON_HOLD_DURATION = 1500; // 1.5s hold to trigger

// Check-in
export const CHECKIN_REMINDER_BEFORE_SERVICE = 30; // minutes

// RevenueCat
export const REVENUECAT_IOS_API_KEY = 'sk_EpGhqDxUJGhOTcGrnuJHKAyQbooTe';
export const REVENUECAT_ANDROID_API_KEY = 'sk_EpGhqDxUJGhOTcGrnuJHKAyQbooTe';

// One entitlement per paid tier — names must match RevenueCat dashboard exactly
export const REVENUECAT_ENTITLEMENT_STARTER = 'starter';
export const REVENUECAT_ENTITLEMENT_TEAM = 'team';
export const REVENUECAT_ENTITLEMENT_PRO = 'pro';

// RevenueCat product identifiers — must match App Store Connect / Google Play product IDs
export const REVENUECAT_PRODUCT_STARTER = 'starter_monthly';
export const REVENUECAT_PRODUCT_TEAM = 'team_monthly';
export const REVENUECAT_PRODUCT_PRO = 'pro_monthly';
