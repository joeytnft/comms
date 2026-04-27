import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

// Local type aliases — expo-server-sdk is ESM-only so top-level import type is
// rejected by Node16 moduleResolution. These match the shapes we actually use.
type ExpoPushToken = string;
interface ExpoPushMessage {
  to: string | string[];
  // 'default' for standard alerts; critical object for life-safety emergencies
  sound?: 'default' | null | { critical: boolean; volume: number; name: string };
  title?: string;
  body?: string;
  priority?: 'default' | 'normal' | 'high';
  data?: Record<string, unknown>;
  channelId?: string;
  // iOS: ttl in seconds; 0 = discard if undeliverable
  expiration?: number;
}

// expo-server-sdk is ESM-only; use dynamic import to avoid CJS interop error
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _expoCache: Promise<{ expo: any; Expo: any }> | null = null;
function getExpo() {
  if (!_expoCache) {
    _expoCache = import('expo-server-sdk').then((mod) => ({
      Expo: mod.default,
      expo: new mod.default(),
    }));
  }
  return _expoCache;
}

// Resolve push tokens for the recipients of an alert. Filters by:
//   - alert.targetGroups → users in those groups (and their lead group, since
//     fan-out has already been done at create time so targetGroups already
//     contains the parents)
//   - alert.campusId    → only users assigned to that campus, when set
//   - alertType === 'ACTIVE_SHOOTER' → bypass group filter (broadcast), still
//     scoped by campusId when set
async function resolveAlertRecipientTokens(
  alertId: string,
  isActiveShooter: boolean,
): Promise<string[]> {
  const { Expo } = await getExpo();

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      organizationId: true,
      campusId: true,
      targetGroups: { select: { groupId: true } },
    },
  });
  if (!alert) return [];

  const targetGroupIds = alert.targetGroups.map((g) => g.groupId);

  // Build a where clause that respects group + campus targeting.
  const whereClauses: Array<Record<string, unknown>> = [
    { organizationId: alert.organizationId },
    { expoPushToken: { not: null } },
  ];

  if (alert.campusId) {
    whereClauses.push({
      OR: [
        { campusId: alert.campusId },
        // Org admins still receive broadcasts even when campus-scoped, so
        // they can respond from another campus if needed.
        { isOrgAdmin: true },
      ],
    });
  }

  if (!isActiveShooter && targetGroupIds.length > 0) {
    whereClauses.push({
      OR: [
        { memberships: { some: { groupId: { in: targetGroupIds } } } },
        { isOrgAdmin: true },
      ],
    });
  }

  const users = await prisma.user.findMany({
    where: { AND: whereClauses },
    select: { expoPushToken: true },
  });

  return users
    .map((u) => u.expoPushToken!)
    .filter((t) => Expo.isExpoPushToken(t));
}

// ── Critical Alert (Active Shooter) ──────────────────────────────────────────
// iOS: requires com.apple.developer.usernotifications.critical-alerts entitlement
// from Apple (must be manually requested at developer.apple.com/contact/request/).
// The `sound.critical: true` field bypasses mute switch and Do Not Disturb.
// Android: routes to the `critical-alerts` channel which has bypassDnd + ALARM usage.
export async function sendCriticalAlertPushNotification(
  _organizationId: string,
  alertId: string,
  triggeredByName: string,
): Promise<void> {
  const { expo } = await getExpo();
  const tokens = await resolveAlertRecipientTokens(alertId, /*isActiveShooter*/ true);
  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token as ExpoPushToken,
    sound: { critical: true, volume: 1.0, name: 'default' },
    title: '🚨 ACTIVE SHOOTER',
    body: `${triggeredByName} has reported an active shooter. Respond immediately.`,
    priority: 'high',
    expiration: Math.floor(Date.now() / 1000) + 300,
    data: { alertId, level: 'EMERGENCY', alertType: 'ACTIVE_SHOOTER', type: 'alert' },
    channelId: 'critical-alerts',
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      logger.error({ err }, '[Push] Failed to send critical alert notifications chunk');
    }
  }

  logger.info(`[Push] Sent CRITICAL ALERT to ${tokens.length} devices`);
}

export async function sendAlertPushNotifications(
  _organizationId: string,
  alertId: string,
  level: string,
  _message: string | null,
  triggeredByName: string,
): Promise<void> {
  const { expo } = await getExpo();
  const tokens = await resolveAlertRecipientTokens(alertId, /*isActiveShooter*/ false);
  if (tokens.length === 0) return;

  const levelEmoji = level === 'EMERGENCY' ? '🚨' : level === 'WARNING' ? '⚠️' : 'ℹ️';
  const title = `${levelEmoji} ${level} Alert`;
  // Drop the plaintext alert message from the push body — push goes through
  // Apple/Google/Expo and may be cached server-side. Devices fetch the alert
  // payload via authenticated API on tap; the body just nudges the user to
  // open the app.
  const body = `${triggeredByName} triggered an alert. Tap to view details.`;

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token as ExpoPushToken,
    sound: level === 'EMERGENCY' ? 'default' : undefined,
    title,
    body,
    priority: level === 'EMERGENCY' ? 'high' : 'normal',
    data: { alertId, level, type: 'alert' },
    channelId: 'alerts',
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      logger.error({ err }, '[Push] Failed to send alert notifications chunk');
    }
  }

  logger.info(`[Push] Sent alert notifications to ${tokens.length} devices`);
}

export async function sendTrainingSignupNotification(
  organizationId: string,
  trainingEventId: string,
  trainingTitle: string,
  memberName: string,
): Promise<void> {
  const { expo, Expo } = await getExpo();

  // Send only to org admins and group admins
  const admins = await prisma.user.findMany({
    where: {
      organizationId,
      OR: [
        { isOrgAdmin: true },
        { memberships: { some: { role: 'ADMIN' } } },
      ],
      expoPushToken: { not: null },
    },
    select: { expoPushToken: true },
  });

  const tokens = admins
    .map((u) => u.expoPushToken!)
    .filter((t) => Expo.isExpoPushToken(t));

  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token as ExpoPushToken,
    sound: 'default',
    title: 'New Training Signup',
    body: `${memberName} signed up for "${trainingTitle}"`,
    priority: 'normal',
    data: { trainingEventId, type: 'training_signup' },
    channelId: 'training',
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      logger.error({ err }, '[Push] Failed to send training signup notifications chunk');
    }
  }

  logger.info(`[Push] Sent training signup notifications to ${tokens.length} admins`);
}

export async function sendMessagePushNotification(
  recipientToken: string,
  senderName: string,
  groupName: string,
  messageId: string,
  groupId: string,
): Promise<void> {
  const { expo, Expo } = await getExpo();
  if (!Expo.isExpoPushToken(recipientToken)) return;

  try {
    await expo.sendPushNotificationsAsync([{
      to: recipientToken as ExpoPushToken,
      sound: 'default',
      title: groupName,
      body: `${senderName} sent a message`,
      priority: 'normal',
      data: { messageId, groupId, groupName, type: 'message' },
      channelId: 'messages',
    }]);
  } catch (err) {
    logger.error({ err }, '[Push] Failed to send message notification');
  }
}

/**
 * Send chat message push notifications to all group members except the sender.
 * Fire-and-forget — call without await in hot paths.
 */
export async function sendChatMessagePushNotifications(
  groupId: string,
  senderId: string,
  messageId: string,
  senderName: string,
  groupName: string,
): Promise<void> {
  const { expo, Expo } = await getExpo();

  const members = await prisma.groupMembership.findMany({
    where: { groupId, userId: { not: senderId } },
    select: { user: { select: { expoPushToken: true } } },
  });

  const tokens = members
    .map((m) => m.user.expoPushToken)
    .filter((t): t is string => !!t && Expo.isExpoPushToken(t));

  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token as ExpoPushToken,
    sound: 'default',
    title: groupName,
    body: `${senderName} sent a message`,
    priority: 'normal',
    data: { messageId, groupId, groupName, type: 'message' },
    channelId: 'messages',
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      logger.error({ err }, '[Push] Failed to send chat message notifications chunk');
    }
  }
}
