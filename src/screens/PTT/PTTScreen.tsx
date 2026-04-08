import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePTT } from '@/contexts/PTTContext';
import { useGroupStore } from '@/store/useGroupStore';
import { usePTTStore } from '@/store/usePTTStore';
import { usePTTLogStore } from '@/store/usePTTLogStore';
import { PTTButton } from '@/components/ptt/PTTButton';
import { VoiceIndicator } from '@/components/ptt/VoiceIndicator';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { Group, PttLog } from '@/types';
import { ENV } from '@/config/env';

export function PTTScreen() {
  const {
    pttState,
    isConnected,
    isConnecting,
    currentGroupId,
    currentGroupName,
    activeSpeaker,
    connectedMemberCount,
    startTransmitting,
    stopTransmitting,
    joinChannel,
    leaveChannel,
  } = usePTT();

  const { groups, fetchGroups } = useGroupStore();
  const { error, clearError } = usePTTStore();
  const { logs, isLoading: logsLoading, fetchLogs } = usePTTLogStore();
  const [showGroupPicker, setShowGroupPicker] = useState(!isConnected);
  const [showLog, setShowLog] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const groupLogs = currentGroupId ? (logs[currentGroupId] ?? []) : [];

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert('PTT Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  useEffect(() => {
    if (currentGroupId && showLog) {
      fetchLogs(currentGroupId);
    }
  }, [currentGroupId, showLog]);

  const handlePlayLog = useCallback((log: PttLog) => {
    const url = `${ENV.apiUrl}${log.audioUrl}`;
    if (Platform.OS === 'web') {
      if (playingUrl === url) {
        setPlayingUrl(null);
      } else {
        setPlayingUrl(url);
        const audio = new window.Audio(url);
        audio.play().catch(() => null);
        audio.onended = () => setPlayingUrl(null);
      }
    } else {
      // Native: open URL in system player or use expo-audio
      Alert.alert('Play Recording', 'Open audio URL:\n' + url, [{ text: 'OK' }]);
    }
  }, [playingUrl]);

  const handleJoinGroup = useCallback(
    async (group: Group) => {
      try {
        await joinChannel(group.id);
        setShowGroupPicker(false);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to join PTT channel';
        Alert.alert('Error', message);
      }
    },
    [joinChannel],
  );

  const handleDisconnect = useCallback(() => {
    leaveChannel();
    setShowGroupPicker(true);
  }, [leaveChannel]);

  // Group picker view (not connected)
  if (showGroupPicker && !isConnected) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Push to Talk</Text>
          <Text style={styles.subtitle}>Select a channel to start</Text>
        </View>

        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.groupList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.groupCard}
              onPress={() => handleJoinGroup(item)}
              disabled={isConnecting}
            >
              <View style={styles.groupInfo}>
                <Text style={styles.groupName}>{item.name}</Text>
                <Text style={styles.groupType}>
                  {item.type === 'LEAD' ? 'Lead Channel' : 'Sub Channel'}
                </Text>
              </View>
              <View style={styles.groupMembers}>
                <Text style={styles.memberCount}>{item.memberCount}</Text>
                <Text style={styles.memberLabel}>members</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No channels available</Text>
              <Text style={styles.emptySubtext}>
                Join or create a channel first
              </Text>
            </View>
          }
        />

        {isConnecting && (
          <View style={styles.connectingOverlay}>
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Active PTT view (connected to a group)
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Channel header */}
      <View style={styles.channelHeader}>
        <View style={styles.channelInfo}>
          <View style={styles.connectedDot} />
          <Text style={styles.channelName} numberOfLines={1}>
            {currentGroupName}
          </Text>
        </View>
        <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Leave</Text>
        </TouchableOpacity>
      </View>

      {/* Connected members count */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {connectedMemberCount} member{connectedMemberCount !== 1 ? 's' : ''} online
        </Text>
      </View>

      {/* Active speaker indicator */}
      {activeSpeaker && (
        <View style={styles.speakerContainer}>
          <VoiceIndicator
            displayName={activeSpeaker.displayName}
            isTransmitting={true}
          />
        </View>
      )}

      {/* Main PTT button area */}
      <View style={styles.pttArea}>
        <PTTButton
          state={pttState}
          onPressIn={startTransmitting}
          onPressOut={stopTransmitting}
          disabled={!isConnected}
        />
      </View>

      {/* Hint text */}
      <Text style={styles.hintText}>
        {pttState === 'idle'
          ? 'Press and hold to talk'
          : pttState === 'transmitting'
            ? 'Release to stop'
            : 'Listening...'}
      </Text>

      {/* Voice log toggle */}
      <TouchableOpacity
        style={styles.logToggle}
        onPress={() => {
          if (!showLog && currentGroupId) fetchLogs(currentGroupId);
          setShowLog(!showLog);
        }}
      >
        <Text style={styles.logToggleText}>
          {showLog ? 'Hide Voice Log' : `Voice Log (${groupLogs.length})`}
        </Text>
      </TouchableOpacity>

      {/* Voice log list */}
      {showLog && (
        <FlatList
          data={groupLogs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.logList}
          style={styles.logContainer}
          ListEmptyComponent={
            <Text style={styles.logEmpty}>
              {logsLoading ? 'Loading...' : 'No recordings yet'}
            </Text>
          }
          renderItem={({ item }) => {
            const url = `${ENV.apiUrl}${item.audioUrl}`;
            const isPlaying = playingUrl === url;
            const secs = Math.round(item.durationMs / 1000);
            return (
              <TouchableOpacity
                style={styles.logItem}
                onPress={() => handlePlayLog(item)}
              >
                <View style={[styles.playIcon, isPlaying && styles.playIconActive]}>
                  <Text style={styles.playIconText}>{isPlaying ? '■' : '▶'}</Text>
                </View>
                <View style={styles.logInfo}>
                  <Text style={styles.logSender}>{item.sender.displayName}</Text>
                  <Text style={styles.logTime}>
                    {new Date(item.createdAt).toLocaleTimeString()}
                    {secs > 0 ? ` · ${secs}s` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Change channel button */}
      <TouchableOpacity
        style={styles.changeGroupButton}
        onPress={() => {
          handleDisconnect();
        }}
      >
        <Text style={styles.changeGroupText}>Switch Channel</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.textPrimary,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  groupList: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  groupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  groupType: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  groupMembers: {
    alignItems: 'center',
    marginLeft: SPACING.md,
  },
  memberCount: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.info,
  },
  memberLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyText: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textMuted,
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  connectingOverlay: {
    position: 'absolute',
    bottom: SPACING.xxl,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  connectingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.info,
    fontWeight: '600',
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  channelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.sm,
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
  },
  channelName: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
    flex: 1,
  },
  disconnectButton: {
    backgroundColor: COLORS.gray700,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  disconnectText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.danger,
    fontWeight: '600',
  },
  statusBar: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  statusText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
  },
  speakerContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  pttArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingBottom: SPACING.md,
  },
  changeGroupButton: {
    alignSelf: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  changeGroupText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    fontWeight: '600',
  },
  logToggle: {
    alignSelf: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    borderRadius: BORDER_RADIUS.sm,
  },
  logToggleText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  logContainer: {
    maxHeight: 200,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
  },
  logList: {
    padding: SPACING.sm,
  },
  logEmpty: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    padding: SPACING.md,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
    gap: SPACING.sm,
  },
  playIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconActive: {
    backgroundColor: COLORS.danger,
  },
  playIconText: {
    color: COLORS.white,
    fontSize: 12,
  },
  logInfo: {
    flex: 1,
  },
  logSender: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  logTime: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
