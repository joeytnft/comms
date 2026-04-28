import React from 'react';
import { View, StyleSheet } from 'react-native';
import { TeamMemberLocation, Geofence, Alert } from '@/types';
import { ALERT_COLORS } from '@/types/alert';
import { COLORS, BORDER_RADIUS, SHADOWS } from '@/config/theme';

interface Props {
  locations: TeamMemberLocation[];
  geofence?: Geofence | null;
  activeAlerts?: Alert[];
  style?: object;
}

const W = 100;
const H = 100;
const PAD = 10;

const isOnline = (updatedAt: string) =>
  Date.now() - new Date(updatedAt).getTime() < 300_000;

export function TeamMapView({ locations, geofence, activeAlerts = [], style }: Props) {
  // Include geofence center / polygon vertices in bounds calculation so the
  // shape is fully visible when the map auto-frames.
  const alertsWithCoords = activeAlerts.filter((a) => a.latitude != null && a.longitude != null);
  const polyRing = geofence?.type === 'polygon' && geofence.polygon ? geofence.polygon : null;
  const allLats = [
    ...locations.map((l) => l.latitude),
    ...alertsWithCoords.map((a) => a.latitude!),
    ...(geofence ? [geofence.latitude] : []),
    ...(polyRing ? polyRing.map(([, lat]) => lat) : []),
  ];
  const allLngs = [
    ...locations.map((l) => l.longitude),
    ...alertsWithCoords.map((a) => a.longitude!),
    ...(geofence ? [geofence.longitude] : []),
    ...(polyRing ? polyRing.map(([lng]) => lng) : []),
  ];
  const lats = allLats.length ? allLats : [0];
  const lngs = allLngs.length ? allLngs : [0];

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

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

        {/* Geofence boundary — polygon if drawn, circle otherwise */}
        {geofence && polyRing && polyRing.length >= 3 ? (
          (() => {
            const pts = polyRing.map(([lng, lat]) => `${toX(lng)},${toY(lat)}`).join(' ');
            const cx = toX(geofence.longitude);
            const cy = toY(geofence.latitude);
            return (
              <g key="geofence">
                <polygon points={pts}
                  fill={COLORS.info + '18'} stroke={COLORS.info} strokeWidth="0.5" />
                <text x={cx} y={cy} textAnchor="middle"
                  fontSize="2.5" fill={COLORS.info}>{geofence.name}</text>
              </g>
            );
          })()
        ) : geofence ? (
          (() => {
            const cx = toX(geofence.longitude);
            const cy = toY(geofence.latitude);
            // 1 degree lat ≈ 111km. Map lngRange maps to (W - PAD*2) SVG units.
            const metersPerSvgUnit = (lngRange * 111320) / (W - PAD * 2);
            const r = geofence.radius / metersPerSvgUnit;
            return (
              <g key="geofence">
                <circle cx={cx} cy={cy} r={r}
                  fill={COLORS.info + '18'} stroke={COLORS.info} strokeWidth="0.5" />
                <text x={cx} y={cy - r - 1.5} textAnchor="middle"
                  fontSize="2.5" fill={COLORS.info}>{geofence.name}</text>
              </g>
            );
          })()
        ) : null}

        {locations.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="4" fill={COLORS.textMuted}>
            No locations yet
          </text>
        )}

        {alertsWithCoords.map((alert) => {
          const x = toX(alert.longitude!);
          const y = toY(alert.latitude!);
          const color = ALERT_COLORS[alert.level];
          return (
            <g key={`alert-${alert.id}`}>
              <circle cx={x} cy={y} r="6" fill={color} opacity="0.25" />
              <circle cx={x} cy={y} r="3.5" fill={color} />
              <text x={x} y={y + 0.9} textAnchor="middle"
                dominantBaseline="middle" fontSize="3" fill="#fff">!</text>
              <text x={x} y={y + 8} textAnchor="middle"
                fontSize="2.2" fill={color}>{alert.triggeredBy.displayName}</text>
            </g>
          );
        })}

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
