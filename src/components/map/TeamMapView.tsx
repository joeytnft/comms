import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { TeamMemberLocation } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

interface Props {
  locations: TeamMemberLocation[];
  style?: object;
}

// --- Web: SVG dot-map --------------------------------------------------------

function WebMapView({ locations }: Props) {
  const W = 100;
  const H = 100;
  const PADDING = 10;

  const lats = locations.map((l) => l.latitude);
  const lngs = locations.map((l) => l.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  const toX = (lng: number) =>
    PADDING + ((lng - minLng) / lngRange) * (W - PADDING * 2);
  const toY = (lat: number) =>
    PADDING + ((maxLat - lat) / latRange) * (H - PADDING * 2); // invert Y

  const isOnline = (updatedAt: string) =>
    Date.now() - new Date(updatedAt).getTime() < 300_000;

  return (
    <View style={webStyles.container}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Grid lines */}
        <line x1={PADDING} y1={PADDING} x2={W - PADDING} y2={PADDING} stroke={COLORS.gray700} strokeWidth="0.3" />
        <line x1={PADDING} y1={H - PADDING} x2={W - PADDING} y2={H - PADDING} stroke={COLORS.gray700} strokeWidth="0.3" />
        <line x1={PADDING} y1={PADDING} x2={PADDING} y2={H - PADDING} stroke={COLORS.gray700} strokeWidth="0.3" />
        <line x1={W - PADDING} y1={PADDING} x2={W - PADDING} y2={H - PADDING} stroke={COLORS.gray700} strokeWidth="0.3" />

        {locations.map((member) => {
          const x = toX(member.longitude);
          const y = toY(member.latitude);
          const online = isOnline(member.updatedAt);
          const initial = member.displayName.charAt(0).toUpperCase();
          return (
            <g key={member.userId}>
              {/* Pulse ring for online members */}
              {online && (
                <circle cx={x} cy={y} r="5" fill="none" stroke={COLORS.success} strokeWidth="0.5" opacity="0.5" />
              )}
              <circle cx={x} cy={y} r="3.5" fill={online ? COLORS.accent : COLORS.gray600} />
              <text
                x={x}
                y={y + 0.9}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="2.5"
                fontWeight="bold"
                fill={COLORS.white}
              >
                {initial}
              </text>
              <text
                x={x}
                y={y + 6.5}
                textAnchor="middle"
                fontSize="2.5"
                fill={COLORS.textSecondary}
              >
                {member.displayName.split(' ')[0]}
              </text>
            </g>
          );
        })}

        {locations.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="4" fill={COLORS.textMuted}>
            No locations yet
          </text>
        )}
      </svg>
    </View>
  );
}

const webStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
});

// --- Native: react-native-maps -----------------------------------------------

function NativeMapView({ locations }: Props) {
  // Dynamically import to avoid crashing on web
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MapView = require('react-native-maps').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Marker, Callout } = require('react-native-maps');

  const isOnline = (updatedAt: string) =>
    Date.now() - new Date(updatedAt).getTime() < 300_000;

  const centerLat = locations.length
    ? locations.reduce((s, l) => s + l.latitude, 0) / locations.length
    : 37.7749;
  const centerLng = locations.length
    ? locations.reduce((s, l) => s + l.longitude, 0) / locations.length
    : -122.4194;

  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
    >
      {locations.map((member) => (
        <Marker
          key={member.userId}
          coordinate={{ latitude: member.latitude, longitude: member.longitude }}
          pinColor={isOnline(member.updatedAt) ? COLORS.success : COLORS.gray500}
        >
          <Callout>
            <View style={nativeStyles.callout}>
              <Text style={nativeStyles.calloutName}>{member.displayName}</Text>
              <Text style={nativeStyles.calloutCoords}>
                {member.latitude.toFixed(4)}, {member.longitude.toFixed(4)}
              </Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const nativeStyles = StyleSheet.create({
  callout: {
    padding: SPACING.sm,
    minWidth: 120,
  },
  calloutName: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  calloutCoords: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});

// --- Export ------------------------------------------------------------------

export function TeamMapView({ locations, style }: Props) {
  if (Platform.OS === 'web') {
    return (
      <View style={[mapViewStyles.wrapper, style]}>
        <WebMapView locations={locations} />
      </View>
    );
  }
  return (
    <View style={[mapViewStyles.wrapper, style]}>
      <NativeMapView locations={locations} />
    </View>
  );
}

const mapViewStyles = StyleSheet.create({
  wrapper: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
});
