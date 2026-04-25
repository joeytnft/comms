import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import MapView, { Marker, Callout, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { TeamMemberLocation, Geofence, Alert } from '@/types';
import { ALERT_COLORS, ALERT_TYPE_DEFS } from '@/types/alert';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

interface Props {
  locations: TeamMemberLocation[];
  geofence?: Geofence | null;
  activeAlerts?: Alert[];
  style?: object;
}

const DELTA = 0.0009; // ~300 ft zoom

const isOnline = (updatedAt: string) =>
  Date.now() - new Date(updatedAt).getTime() < 300_000;

function MemberAvatarPin({ member }: { member: TeamMemberLocation }) {
  const online = isOnline(member.updatedAt);
  const borderColor = online ? COLORS.success : COLORS.gray500;
  const initials = member.displayName
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.avatarPin}>
      <View style={[styles.avatarPinCircle, { borderColor }]}>
        {member.avatarUrl ? (
          <Image source={{ uri: member.avatarUrl }} style={styles.avatarPinImage} />
        ) : (
          <Text style={styles.avatarPinInitials}>{initials}</Text>
        )}
      </View>
      <View style={[styles.avatarPinTail, { borderTopColor: borderColor }]} />
    </View>
  );
}

export function TeamMapView({ locations, geofence, activeAlerts = [], style }: Props) {
  const mapRef = useRef<MapView>(null);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const centeredRef = useRef(false); // has the map been centered at least once?

  // Get device location once and keep it updated
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;

      // Get immediate high-accuracy fix
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation })
        .then((loc) => {
          setDeviceCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        })
        .catch(() => null);

      // Live tracking — high accuracy, update every ~1s or 2m of movement
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1_000, distanceInterval: 2 },
        (loc) => {
          setDeviceCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        },
      ).then((s) => { sub = s; }).catch(() => null);
    });

    return () => { sub?.remove(); };
  }, []);

  // Center the map whenever deviceCoords first resolves, then follow on every update
  useEffect(() => {
    if (!deviceCoords) return;
    mapRef.current?.animateToRegion(
      {
        latitude: deviceCoords.lat,
        longitude: deviceCoords.lng,
        latitudeDelta: DELTA,
        longitudeDelta: DELTA,
      },
      centeredRef.current ? 800 : 0, // no animation on first center
    );
    centeredRef.current = true;
  }, [deviceCoords]);

  // When the geofence changes (campus switch), pan the map to the new boundary center
  // so the circle is visible even if the user is at a different location.
  const prevGeofenceId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!geofence || geofence.id === prevGeofenceId.current) return;
    prevGeofenceId.current = geofence.id;
    // Zoom out enough to show the full geofence circle
    const degreeSpan = (geofence.radius / 111_000) * 3; // ~3x radius in degrees
    mapRef.current?.animateToRegion(
      {
        latitude: geofence.latitude,
        longitude: geofence.longitude,
        latitudeDelta: Math.max(degreeSpan, DELTA),
        longitudeDelta: Math.max(degreeSpan, DELTA),
      },
      600,
    );
  }, [geofence]);

  // Fallback initial region — overridden once deviceCoords arrives
  const fallbackLat = geofence?.latitude
    ?? (locations.length ? locations.reduce((s, l) => s + l.latitude, 0) / locations.length : null)
    ?? 37.7749;
  const fallbackLng = geofence?.longitude
    ?? (locations.length ? locations.reduce((s, l) => s + l.longitude, 0) / locations.length : null)
    ?? -122.4194;

  return (
    <View style={[styles.wrapper, style]}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{
          latitude: fallbackLat,
          longitude: fallbackLng,
          latitudeDelta: DELTA,
          longitudeDelta: DELTA,
        }}
      >
        {/* Geofence boundary circle */}
        {geofence && (
          <Circle
            key={geofence.id}
            center={{ latitude: geofence.latitude, longitude: geofence.longitude }}
            radius={geofence.radius}
            strokeColor={COLORS.info}
            fillColor={COLORS.info + '20'}
            strokeWidth={2}
          />
        )}

        {/* Alert pins — shown for active alerts with GPS coords, removed on resolve */}
        {activeAlerts
          .filter((a) => a.latitude != null && a.longitude != null)
          .map((alert) => {
            const pinColor = ALERT_COLORS[alert.level];
            const emoji = alert.alertType ? (ALERT_TYPE_DEFS[alert.alertType]?.emoji ?? '🚨') : '🚨';
            return (
              <Marker
                key={`alert-${alert.id}`}
                coordinate={{ latitude: alert.latitude!, longitude: alert.longitude! }}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={[styles.alertPin, { borderColor: pinColor }]}>
                  <Text style={styles.alertPinEmoji}>{emoji}</Text>
                </View>
                <Callout>
                  <View style={styles.callout}>
                    <Text style={[styles.calloutName, { color: pinColor }]}>
                      {emoji} {alert.level}
                    </Text>
                    <Text style={styles.calloutCoords}>
                      Reported by {alert.triggeredBy.displayName}
                    </Text>
                    {alert.message ? (
                      <Text style={styles.calloutCoords}>{alert.message}</Text>
                    ) : null}
                  </View>
                </Callout>
              </Marker>
            );
          })}

        {locations.map((member) => (
          <Marker
            key={member.userId}
            coordinate={{ latitude: member.latitude, longitude: member.longitude }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <MemberAvatarPin member={member} />
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{member.displayName}</Text>
                <Text style={styles.calloutCoords}>
                  {isOnline(member.updatedAt) ? '🟢 Online' : '⚫ Last seen'}
                  {'  ·  '}{member.latitude.toFixed(4)}, {member.longitude.toFixed(4)}
                </Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
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
  avatarPin: {
    alignItems: 'center',
  },
  avatarPinCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 2.5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  avatarPinImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarPinInitials: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  avatarPinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  alertPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  alertPinEmoji: {
    fontSize: 20,
  },
  callout: {
    padding: SPACING.sm,
    minWidth: 140,
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
