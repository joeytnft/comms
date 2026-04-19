import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

// Local type aliases — expo-server-sdk is ESM-only so top-level import type is
// rejected by Node16 moduleResolution. These match the shapes we actually use.
type ExpoPushToken = string;
interface ExpoPushMessage {
  to: string | string[];
  sound?: 'default' | null;
  title?: string;
  body?: string;
  priority?: 'default' | 'normal' | 'high';
  data?: Record<string, unknown>;
  channelId?: string;
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

export async function sendAlertPushNotifications(
  organizationId: string,
  alertId: string,
  level: string,
  message: string | null,
  triggeredByName: string,
): Promise<void> {
  const { expo, Expo } = await getExpo();

  // Fetch all push tokens for active org members
  const users = await prisma.user.findMany({
    where: { organizationId, expoPushToken: { not: null } },
    select: { expoPushToken: true },
  });

  const tokens = users
    .map((u) => u.expoPushToken!)
    .filter((t) => Expo.isExpoPushToken(t));

  if (tokens.length === 0) return;

  const levelEmoji = level === 'EMERGENCY' ? '🚨' : level === 'WARNING' ? '⚠️' : 'ℹ️';
  const title = `${levelEmoji} ${level} Alert`;
  const body = message
    ? `${triggeredByName}: ${message}`
    : `Alert triggered by ${triggeredByName}`;

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
      data: { messageId, groupId, type: 'message' },
      channelId: 'messages',
    }]);
  } catch (err) {
    logger.error({ err }, '[Push] Failed to send message notification');
  }
}
