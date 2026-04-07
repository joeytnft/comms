import React, { useEffect, useState } from 'react';
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

const isOnline = (updatedAt: string) =>
  Date.now() - new Date(updatedAt).getTime() < 300_000;

export function TeamMapView({ locations, geofence, style }: Props) {
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((loc) => {
        setDeviceCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }).catch(() => null);
    });
  }, []);

  const centerLat = geofence?.latitude
    ?? (locations.length ? locations.reduce((s, l) => s + l.latitude, 0) / locations.length : null)
    ?? deviceCoords?.lat
    ?? 37.7749;
  const centerLng = geofence?.longitude
    ?? (locations.length ? locations.reduce((s, l) => s + l.longitude, 0) / locations.length : null)
    ?? deviceCoords?.lng
    ?? -122.4194;

  return (
    <View style={[styles.wrapper, style]}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
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
