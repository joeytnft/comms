import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIncidentStore } from '@/store/useIncidentStore';
import { Incident, SEVERITY_COLORS, SEVERITY_LABELS, STATUS_LABELS } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { IncidentStackParamList } from '@/navigation/IncidentStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<IncidentStackParamList, 'IncidentList'>;
};

export function IncidentListScreen({ navigation }: Props) {
  const { incidents, isLoading, error, nextCursor, fetchIncidents, loadMore } =
    useIncidentStore();

  useFocusEffect(
    useCallback(() => {
      fetchIncidents();
    }, []),
  );

  const handlePress = (incident: Incident) => {
    navigation.navigate('IncidentDetail', { incidentId: incident.id });
  };

  const handleCreate = () => {
    navigation.navigate('IncidentReport');
  };

  const renderIncident = ({ item }: { item: Incident }) => {
    const severityColor = SEVERITY_COLORS[item.severity];

    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: severityColor }]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
            <Text style={styles.severityText}>{SEVERITY_LABELS[item.severity]}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{STATUS_LABELS[item.status]}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardMeta}>
          Reported by {item.reportedBy.displayName} {'\u00B7'}{' '}
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        {item.photos.length > 0 && (
          <Text style={styles.photoCount}>{item.photos.length} photo(s)</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Incidents</Text>
        <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
          <Text style={styles.createButtonText}>+ Report</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchIncidents()}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={incidents}
        renderItem={renderIncident}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => fetchIncidents()}
            tintColor={COLORS.accent}
          />
        }
        onEndReached={nextCursor ? loadMore : undefined}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No incidents</Text>
            <Text style={styles.emptySubtext}>
              When incidents are reported, they will appear here.
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={handleCreate}>
              <Text style={styles.emptyButtonText}>Report Incident</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.textPrimary,
  },
  createButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  createButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.white,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  severityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.gray700,
  },
  statusText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  cardTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  cardMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  photoCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  errorText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.danger,
  },
  retryText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    marginTop: SPACING.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xxl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  emptySubtext: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 4,
    borderRadius: 8,
    marginTop: SPACING.lg,
  },
  emptyButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
  },
});
