import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTrainingStore } from '@/store/useTrainingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { TrainingEvent } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { TrainingStackParamList } from '@/navigation/TrainingStackNavigator';

type Nav = NativeStackNavigationProp<TrainingStackParamList>;

function TrainingCard({
  training,
  onPress,
}: {
  training: TrainingEvent;
  onPress: () => void;
}) {
  const start = new Date(training.startDate);
  const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const signupStatus = training.mySignup?.status;
  const isPast = start < new Date();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={styles.dateBox}>
          <Text style={styles.dateMonth}>
            {start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
          </Text>
          <Text style={styles.dateDay}>{start.getDate()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {training.title}
          </Text>
          <Text style={styles.cardMeta}>
            {timeStr}
            {training.location ? `  •  ${training.location}` : ''}
          </Text>
          {training.groupTargets.length > 0 && (
            <Text style={styles.cardGroups} numberOfLines={1}>
              {training.groupTargets.map((t) => t.group.name).join(', ')}
            </Text>
          )}
        </View>
        {signupStatus && signupStatus !== 'CANCELLED' && (
          <View
            style={[
              styles.badge,
              signupStatus === 'CONFIRMED' ? styles.badgeConfirmed : styles.badgeWaitlisted,
            ]}
          >
            <Text style={styles.badgeText}>
              {signupStatus === 'CONFIRMED' ? 'Signed up' : 'Waitlisted'}
            </Text>
          </View>
        )}
      </View>
      {training.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {training.description}
        </Text>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={styles.cardCount}>
          {training.confirmedCount ?? 0}
          {training.maxAttendees ? ` / ${training.maxAttendees}` : ''} signed up
        </Text>
        {isPast && <Text style={styles.pastLabel}>Past</Text>}
      </View>
    </TouchableOpacity>
  );
}

export function TrainingListScreen() {
  const navigation = useNavigation<Nav>();
  const { trainings, isLoading, fetchTrainings } = useTrainingStore();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  useFocusEffect(
    useCallback(() => {
      fetchTrainings();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTrainings();
    setRefreshing(false);
  };

  const upcoming = trainings.filter((t) => new Date(t.startDate) >= new Date());
  const past = trainings.filter((t) => new Date(t.startDate) < new Date());

  const sections: TrainingEvent[] = [...upcoming, ...past];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Training Events</Text>
        {isAdmin ? (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('CreateTraining', {})}
          >
            <Text style={styles.addButtonText}>+ New</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {sections.length === 0 && !isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No training events scheduled.</Text>
          {isAdmin && (
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() => navigation.navigate('CreateTraining', {})}
            >
              <Text style={styles.emptyActionText}>Create the first training</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TrainingCard
              training={item}
              onPress={() => navigation.navigate('TrainingDetail', { trainingId: item.id })}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            upcoming.length > 0 && past.length > 0 ? (
              <Text style={styles.sectionHeader}>Upcoming</Text>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        />
      )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  backBtn: { minWidth: 70 },
  backText: { ...TYPOGRAPHY.body, color: COLORS.info },
  headerTitle: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
  },
  addButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  addButtonText: {
    ...TYPOGRAPHY.body,
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: SPACING.md,
  },
  sectionHeader: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  dateBox: {
    width: 44,
    alignItems: 'center',
    backgroundColor: COLORS.accent + '18',
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 4,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  dateDay: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.accent,
    lineHeight: 24,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  cardMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cardGroups: {
    ...TYPOGRAPHY.caption,
    color: COLORS.accent,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.xs,
    alignSelf: 'flex-start',
  },
  badgeConfirmed: {
    backgroundColor: COLORS.success + '22',
  },
  badgeWaitlisted: {
    backgroundColor: COLORS.warning + '22',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  cardDescription: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray700,
  },
  cardCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  pastLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  emptyAction: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  emptyActionText: {
    ...TYPOGRAPHY.body,
    color: '#fff',
    fontWeight: '600',
  },
});
