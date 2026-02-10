import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { Button } from '@/components/common';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { SubscriptionTier } from '@/types/subscription';

const TIER_COLORS: Record<SubscriptionTier, string> = {
  FREE: COLORS.gray500,
  BASIC: COLORS.info,
  STANDARD: COLORS.warning,
  ENTERPRISE: COLORS.accent,
};

const FEATURE_LABELS: Record<string, string> = {
  ptt: 'Push-to-Talk Voice',
  alerts: 'Panic Alerts',
  location: 'Live Location Sharing',
  incidents: 'Incident Logging',
  multiCampus: 'Multi-Campus Support',
};

function formatLimit(value: number, label: string): string {
  if (value === -1) return `Unlimited ${label}`;
  return `${value} ${label}`;
}

export function SubscriptionScreen() {
  const { subscription, plans, isLoading, fetchSubscription, fetchPlans, daysLeftInTrial, tierLabel } = useSubscriptionStore();

  useEffect(() => {
    fetchSubscription();
    fetchPlans();
  }, []);

  const currentTier = subscription?.tier || 'FREE';
  const trialDays = daysLeftInTrial();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Subscription</Text>

        {/* Current plan card */}
        <View style={[styles.currentPlan, { borderColor: TIER_COLORS[currentTier] }]}>
          <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[currentTier] }]}>
            <Text style={styles.tierBadgeText}>{tierLabel()}</Text>
          </View>
          <Text style={styles.planStatus}>
            {subscription?.status === 'TRIALING'
              ? `Trial — ${trialDays} day${trialDays !== 1 ? 's' : ''} left`
              : subscription?.status === 'ACTIVE'
                ? 'Active'
                : subscription?.status || 'Free'}
          </Text>
          {subscription && (
            <View style={styles.usageRow}>
              <Text style={styles.usageText}>
                Members: {subscription.usage.members}
                {subscription.limits.maxMembers > 0 ? ` / ${subscription.limits.maxMembers}` : ' (unlimited)'}
              </Text>
              <Text style={styles.usageText}>
                Lead Groups: {subscription.usage.leadGroups}
                {subscription.limits.maxLeadGroups > 0 ? ` / ${subscription.limits.maxLeadGroups}` : ' (unlimited)'}
              </Text>
              <Text style={styles.usageText}>
                Sub-Groups: {subscription.usage.subGroups}
                {subscription.limits.maxSubGroups > 0 ? ` / ${subscription.limits.maxSubGroups}` : ' (unlimited)'}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.billingNote}>
          Only the account creator is billed. Invited members join for free.
        </Text>

        {/* Plan comparison */}
        <Text style={styles.sectionTitle}>Plans</Text>
        {plans.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          return (
            <View key={plan.tier} style={[styles.planCard, isCurrent && styles.planCardCurrent]}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>
                  {plan.priceMonthly === 0
                    ? 'Free'
                    : `$${(plan.priceMonthly / 100).toFixed(0)}/mo`}
                </Text>
              </View>
              <View style={styles.featureList}>
                <Text style={styles.featureItem}>
                  {formatLimit(plan.limits.maxLeadGroups, plan.limits.maxLeadGroups === 1 ? 'main group' : 'main groups')}
                </Text>
                <Text style={styles.featureItem}>
                  {formatLimit(plan.limits.maxSubGroups, 'sub-groups')}
                </Text>
                <Text style={styles.featureItem}>
                  {formatLimit(plan.limits.maxMembers, 'members')}
                </Text>
                {Object.entries(plan.limits.features).map(([key, enabled]) => (
                  <Text
                    key={key}
                    style={[styles.featureItem, !enabled && styles.featureDisabled]}
                  >
                    {enabled ? '+' : '-'} {FEATURE_LABELS[key] || key}
                  </Text>
                ))}
              </View>
              {!isCurrent && plan.priceMonthly > 0 && (
                <Button
                  title={`Upgrade to ${plan.name}`}
                  variant="primary"
                  onPress={() => {
                    // RevenueCat purchase flow will be integrated here
                  }}
                  style={styles.upgradeButton}
                />
              )}
              {isCurrent && (
                <Text style={styles.currentLabel}>Current Plan</Text>
              )}
            </View>
          );
        })}

        {isLoading && (
          <Text style={styles.loadingText}>Loading...</Text>
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
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  currentPlan: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  tierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.sm,
  },
  tierBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  planStatus: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  usageRow: {
    gap: SPACING.xs,
  },
  usageText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
  },
  billingNote: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  planCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  planCardCurrent: {
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  planName: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  planPrice: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  featureList: {
    gap: SPACING.xs,
  },
  featureItem: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  featureDisabled: {
    color: COLORS.textMuted,
  },
  upgradeButton: {
    marginTop: SPACING.md,
  },
  currentLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.accent,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
});
