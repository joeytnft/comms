import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { geofenceService } from '@/services/geofenceService';
import { useAuthStore } from '@/store/useAuthStore';
import { Geofence } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { MoreStackParamList } from '@/navigation/MoreStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<MoreStackParamList, 'Geofence'>;
};

export function GeofenceScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const campusId = user?.campusId ?? '';
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const [geofence, setGeofence] = useState<Geofence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('200');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    geofenceService.fetchGeofence(campusId).then((gf) => {
      setGeofence(gf);
      if (gf) {
        setName(gf.name);
        setLatitude(String(gf.latitude));
        setLongitude(String(gf.longitude));
        setRadius(String(gf.radius));
      }
      setIsLoading(false);
    });
  }, []);

  const handleSave = async () => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseFloat(radius);

    if (!name.trim()) {
      Alert.alert('Validation', 'Please enter a name for the geofence.');
      return;
    }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      Alert.alert('Validation', 'Latitude must be between -90 and 90.');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      Alert.alert('Validation', 'Longitude must be between -180 and 180.');
      return;
    }
    if (isNaN(rad) || rad < 50 || rad > 50000) {
      Alert.alert('Validation', 'Radius must be between 50 and 50,000 metres.');
      return;
    }

    setIsSaving(true);
    const saved = await geofenceService.saveGeofence({ campusId, name: name.trim(), latitude: lat, longitude: lng, radius: rad });
    setIsSaving(false);

    if (saved) {
      setGeofence(saved);
      Alert.alert('Saved', 'Geofence updated. Team members will be notified when they arrive.');
    } else {
      Alert.alert('Error', 'Failed to save geofence. Make sure you have admin role in a group.');
    }
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to use this feature.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(loc.coords.latitude.toFixed(6));
      setLongitude(loc.coords.longitude.toFixed(6));
    } catch {
      Alert.alert('Error', 'Could not get your location. Make sure GPS is enabled.');
    } finally {
      setLocating(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Remove Geofence', 'Stop monitoring this area?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await geofenceService.deleteGeofence(campusId);
          await geofenceService.stopGeofencing();
          setGeofence(null);
          setName('');
          setLatitude('');
          setLongitude('');
          setRadius('200');
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Geofence</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.description}>
          {isAdmin
            ? 'Set a boundary around your property. When a team member\'s phone enters this area, they receive a notification to open the app and enable location tracking.'
            : 'Shows the geofence boundary set by your org admin.'}
        </Text>

        {geofence && (
          <View style={styles.activeBar}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>
              Active: {geofence.name} ({geofence.radius >= 1000
                ? `${(geofence.radius / 1000).toFixed(1)}km`
                : `${Math.round(geofence.radius)}m`} radius)
            </Text>
          </View>
        )}

        {!isAdmin && !geofence && (
          <View style={styles.activeBar}>
            <Text style={styles.activeText}>No geofence configured for your campus.</Text>
          </View>
        )}

        {/* Edit form — admins only */}
        {isAdmin && <View style={styles.card}>
          <Text style={styles.label}>Location Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Main Campus"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
          />

          <TouchableOpacity
            style={styles.locationButton}
            onPress={handleUseCurrentLocation}
            disabled={locating}
          >
            {locating
              ? <ActivityIndicator color={COLORS.white} size="small" />
              : <Text style={styles.locationButtonText}>Use Current Location</Text>
            }
          </TouchableOpacity>

          <Text style={styles.label}>Latitude</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 37.7749"
            placeholderTextColor={COLORS.textMuted}
            value={latitude}
            onChangeText={setLatitude}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Longitude</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. -122.4194"
            placeholderTextColor={COLORS.textMuted}
            value={longitude}
            onChangeText={setLongitude}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Radius (metres)</Text>
          <View style={styles.presetRow}>
            {[
              { label: '50m', value: '50', hint: 'Small' },
              { label: '100m', value: '100', hint: 'Medium' },
              { label: '200m', value: '200', hint: 'Large' },
            ].map((preset) => (
              <TouchableOpacity
                key={preset.value}
                style={[styles.presetButton, radius === preset.value && styles.presetButtonActive]}
                onPress={() => setRadius(preset.value)}
              >
                <Text style={[styles.presetLabel, radius === preset.value && styles.presetLabelActive]}>
                  {preset.label}
                </Text>
                <Text style={[styles.presetHint, radius === preset.value && styles.presetHintActive]}>
                  {preset.hint}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="or enter custom metres"
            placeholderTextColor={COLORS.textMuted}
            value={radius}
            onChangeText={setRadius}
            keyboardType="number-pad"
          />

          <Text style={styles.hint}>
            Tip: Open Google Maps, long-press your building, and copy the coordinates shown at the bottom.
          </Text>
        </View>}

        {isAdmin && (
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.saveButtonText}>{geofence ? 'Update Geofence' : 'Enable Geofence'}</Text>
            }
          </TouchableOpacity>
        )}

        {isAdmin && geofence && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Remove Geofence</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  backText: { ...TYPOGRAPHY.body, color: COLORS.info },
  headerTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  description: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  activeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.info + '22',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.info,
  },
  activeText: { ...TYPOGRAPHY.bodySmall, color: COLORS.info, fontWeight: '600' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
    marginBottom: SPACING.xs,
  },
  presetRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  presetButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    backgroundColor: COLORS.background,
  },
  presetButtonActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '18',
  },
  presetLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  presetLabelActive: {
    color: COLORS.accent,
  },
  presetHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  presetHintActive: {
    color: COLORS.accent,
  },
  hint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  deleteButton: {
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  deleteButtonText: { ...TYPOGRAPHY.body, color: COLORS.danger, fontWeight: '600' },
  locationButton: {
    backgroundColor: COLORS.info,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  locationButtonText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '600' },
});
