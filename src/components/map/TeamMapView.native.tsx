import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Callout, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { TeamMemberLocation, Geofence } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

interface Props {
  locations: TeamMemberLocation[];
  geofence?: Geofence | null;
  style?: object;
}

const DELTA = 0.01; // ~1km zoom

const isOnline = (updatedAt: string) =>
  Date.now() - new Date(updatedAt).getTime() < 300_000;

export function TeamMapView({ locations, geofence, style }: Props) {
  const mapRef = useRef<MapView>(null);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const centeredRef = useRef(false); // has the map been centered at least once?

  // Get device location once and keep it updated
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;

      // Get immediate fix
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then((loc) => {
          setDeviceCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        })
        .catch(() => null);

      // Keep updating so the map can follow the user
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5_000, distanceInterval: 5 },
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
            center={{ latitude: geofence.latitude, longitude: geofence.longitude }}
            radius={geofence.radius}
            strokeColor={COLORS.info}
            fillColor={COLORS.info + '20'}
            strokeWidth={2}
          />
        )}

        {locations.map((member) => (
          <Marker
            key={member.userId}
            coordinate={{ latitude: member.latitude, longitude: member.longitude }}
            pinColor={isOnline(member.updatedAt) ? COLORS.success : COLORS.gray500}
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{member.displayName}</Text>
                <Text style={styles.calloutCoords}>
                  {member.latitude.toFixed(4)}, {member.longitude.toFixed(4)}
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
