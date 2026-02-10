import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert as RNAlert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useIncidentStore } from '@/store/useIncidentStore';
import { LoadingOverlay } from '@/components/common';
import { SEVERITY_COLORS, SEVERITY_LABELS, STATUS_LABELS, IncidentStatus } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { IncidentStackParamList } from '@/navigation/IncidentStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<IncidentStackParamList, 'IncidentDetail'>;
  route: RouteProp<IncidentStackParamList, 'IncidentDetail'>;
};

const STATUS_TRANSITIONS: Record<string, IncidentStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

export function IncidentDetailScreen({ navigation, route }: Props) {
  const { incidentId } = route.params;
  const { currentIncident, isLoading, error, fetchIncident, updateIncident, clearCurrentIncident } =
    useIncidentStore();

  useEffect(() => {
    fetchIncident(incidentId);
    return () => clearCurrentIncident();
  }, [incidentId]);

  const handleStatusChange = (newStatus: IncidentStatus) => {
    RNAlert.alert(
      'Update Status',
      `Change status to "${STATUS_LABELS[newStatus]}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              await updateIncident(incidentId, { status: newStatus });
            } catch {
              RNAlert.alert('Error', 'Failed to update status');
            }
          },
        },
      ],
    );
  };

  if (isLoading && !currentIncident) {
    return <LoadingOverlay message="Loading incident..." />;
  }

  if (error && !currentIncident) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorFull}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchIncident(incidentId)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentIncident) return null;

  const severityColor = SEVERITY_COLORS[currentIncident.severity];
  const nextStatuses = STATUS_TRANSITIONS[currentIncident.status] || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Incident</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Severity + Status */}
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: severityColor }]}>
            <Text style={styles.badgeText}>{SEVERITY_LABELS[currentIncident.severity]}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: COLORS.gray700 }]}>
            <Text style={styles.badgeText}>{STATUS_LABELS[currentIncident.status]}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{currentIncident.title}</Text>

        {/* Meta */}
        <Text style={styles.meta}>
          Reported by {currentIncident.reportedBy.displayName}
        </Text>
        <Text style={styles.meta}>
          {new Date(currentIncident.createdAt).toLocaleString()}
        </Text>

        {/* Location */}
        {currentIncident.latitude && currentIncident.longitude && (
          <View style={styles.locationRow}>
            <Text style={styles.locationText}>
              Location: {currentIncident.latitude.toFixed(4)},{' '}
              {currentIncident.longitude.toFixed(4)}
            </Text>
          </View>
        )}

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailsCard}>
            <Text style={styles.detailsText}>{currentIncident.encryptedDetails}</Text>
          </View>
        </View>

        {/* Photos */}
        {currentIncident.photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Photos ({currentIncident.photos.length})
            </Text>
            {currentIncident.photos.map((photo) => (
              <View key={photo.id} style={styles.photoCard}>
                <Text style={styles.photoText}>Encrypted photo</Text>
                <Text style={styles.photoDate}>
                  {new Date(photo.createdAt).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Resolved info */}
        {currentIncident.resolvedAt && (
          <View style={styles.resolvedInfo}>
            <Text style={styles.resolvedText}>
              Resolved on {new Date(currentIncident.resolvedAt).toLocaleString()}
            </Text>
          </View>
        )}

        {/* Status actions */}
        {nextStatuses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Update Status</Text>
            <View style={styles.statusActions}>
              {nextStatuses.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={styles.statusButton}
                  onPress={() => handleStatusChange(status)}
                >
                  <Text style={styles.statusButtonText}>
                    {STATUS_LABELS[status]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  backText: {
    ...TYPOGRAPHY.body,
    color: COLORS.info,
  },
  headerTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  badges: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  badge: {
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  badgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
  },
  title: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  meta: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  locationRow: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.sm,
  },
  locationText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  section: {
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  detailsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  detailsText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  photoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  photoText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  photoDate: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  resolvedInfo: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.success + '22',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  resolvedText: {
    ...TYPOGRAPHY.body,
    color: COLORS.success,
    fontWeight: '600',
  },
  statusActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statusButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  statusButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.white,
    fontWeight: '600',
  },
  errorFull: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.danger,
  },
  retryText: {
    ...TYPOGRAPHY.body,
    color: COLORS.info,
    marginTop: SPACING.sm,
  },
});
