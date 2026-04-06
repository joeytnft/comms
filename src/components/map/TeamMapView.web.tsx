import React from 'react';
import { View, StyleSheet } from 'react-native';
import { TeamMemberLocation } from '@/types';
import { COLORS, BORDER_RADIUS, SHADOWS } from '@/config/theme';

interface Props {
  locations: TeamMemberLocation[];
  style?: object;
}

const W = 100;
const H = 100;
const PAD = 10;

const isOnline = (updatedAt: string) =>
  Date.now() - new Date(updatedAt).getTime() < 300_000;

export function TeamMapView({ locations, style }: Props) {
  const lats = locations.map((l) => l.latitude);
  const lngs = locations.map((l) => l.longitude);

  const minLat = lats.length ? Math.min(...lats) : 0;
  const maxLat = lats.length ? Math.max(...lats) : 1;
  const minLng = lngs.length ? Math.min(...lngs) : 0;
  const maxLng = lngs.length ? Math.max(...lngs) : 1;

  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  const toX = (lng: number) => PAD + ((lng - minLng) / lngRange) * (W - PAD * 2);
  const toY = (lat: number) => PAD + ((maxLat - lat) / latRange) * (H - PAD * 2);

  return (
    <View style={[styles.wrapper, style]}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Border */}
        <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2}
          fill="none" stroke={COLORS.gray700} strokeWidth="0.3" />

        {locations.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="4" fill={COLORS.textMuted}>
            No locations yet
          </text>
        )}

        {locations.map((member) => {
          const x = toX(member.longitude);
          const y = toY(member.latitude);
          const online = isOnline(member.updatedAt);
          const initial = member.displayName.charAt(0).toUpperCase();
          return (
            <g key={member.userId}>
              {online && (
                <circle cx={x} cy={y} r="5.5" fill="none"
                  stroke={COLORS.success} strokeWidth="0.4" opacity="0.45" />
              )}
              <circle cx={x} cy={y} r="3.5"
                fill={online ? COLORS.accent : COLORS.gray600} />
              <text x={x} y={y + 0.9} textAnchor="middle"
                dominantBaseline="middle" fontSize="2.5" fontWeight="bold"
                fill={COLORS.white}>
                {initial}
              </text>
              <text x={x} y={y + 7} textAnchor="middle"
                fontSize="2.5" fill={COLORS.textSecondary}>
                {member.displayName.split(' ')[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    ...SHADOWS.sm,
  },
});
