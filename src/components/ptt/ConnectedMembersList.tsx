import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
} from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '@/config/theme';
import { PTTParticipant } from '@/services/pttService';

interface Props {
  participants: PTTParticipant[];
  activeSpeakerId?: string | null;
  currentUserId?: string | null;
}

const AVATAR_SIZE = 48;
const ONLINE_DOT = 10;

// Stable pastel background derived from userId so the same person always gets
// the same colour even without an avatar photo.
const AVATAR_COLORS = [
  '#1d4ed8', '#0369a1', '#0f766e', '#15803d',
  '#7e22ce', '#be185d', '#b45309', '#1e40af',
];
function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function MemberAvatar({
  participant,
  isSpeaking,
  isYou,
}: {
  participant: PTTParticipant;
  isSpeaking: boolean;
  isYou: boolean;
}) {
  const label = isYou ? 'You' : participant.displayName.split(' ')[0];

  return (
    <View style={styles.memberItem}>
      <View style={[styles.avatarRing, isSpeaking && styles.avatarRingSpeaking]}>
        {participant.avatarUrl ? (
          <Image
            source={{ uri: participant.avatarUrl }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarColor(participant.userId) }]}>
            <Text style={styles.avatarInitials}>{initials(participant.displayName)}</Text>
          </View>
        )}
        <View style={styles.onlineDot} />
      </View>
      <Text style={styles.memberName} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function ConnectedMembersList({ participants, activeSpeakerId, currentUserId }: Props) {
  if (participants.length === 0) return null;

  // Current user first, then alphabetical
  const sorted = [...participants].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {sorted.map((p) => (
          <MemberAvatar
            key={p.userId}
            participant={p}
            isSpeaking={p.userId === activeSpeakerId}
            isYou={p.userId === currentUserId}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  memberItem: {
    alignItems: 'center',
    gap: 4,
    width: AVATAR_SIZE + 8,
  },
  avatarRing: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingSpeaking: {
    borderColor: COLORS.pttReceiving,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: ONLINE_DOT,
    height: ONLINE_DOT,
    borderRadius: ONLINE_DOT / 2,
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  memberName: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: AVATAR_SIZE + 8,
  },
});
