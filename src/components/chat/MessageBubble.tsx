import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

interface MessageBubbleProps {
  content: string;
  senderName: string;
  timestamp: string;
  isOwn: boolean;
  isPending?: boolean;
  showSender?: boolean;
}

export function MessageBubble({
  content,
  senderName,
  timestamp,
  isOwn,
  isPending,
  showSender = true,
}: MessageBubbleProps) {
  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
      <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble, isPending && styles.pendingBubble]}>
        {!isOwn && showSender && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}
        <Text style={[styles.content, isOwn ? styles.ownContent : styles.otherContent]}>
          {content}
        </Text>
        <Text style={[styles.time, isOwn ? styles.ownTime : styles.otherTime]}>
          {timeStr}{isPending ? ' ...' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  ownContainer: {
    alignItems: 'flex-end',
  },
  otherContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  ownBubble: {
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: BORDER_RADIUS.sm,
  },
  otherBubble: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: BORDER_RADIUS.sm,
  },
  pendingBubble: {
    opacity: 0.6,
  },
  senderName: {
    ...TYPOGRAPHY.caption,
    color: COLORS.info,
    fontWeight: '600',
    marginBottom: 2,
  },
  content: {
    ...TYPOGRAPHY.body,
  },
  ownContent: {
    color: COLORS.white,
  },
  otherContent: {
    color: COLORS.textPrimary,
  },
  time: {
    ...TYPOGRAPHY.caption,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  ownTime: {
    color: 'rgba(255,255,255,0.6)',
  },
  otherTime: {
    color: COLORS.textMuted,
  },
});
