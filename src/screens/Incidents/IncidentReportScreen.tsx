import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert as RNAlert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useIncidentStore } from '@/store/useIncidentStore';
import { IncidentSeverity, SEVERITY_COLORS, SEVERITY_LABELS } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { IncidentStackParamList } from '@/navigation/IncidentStackNavigator';
import { ENV } from '@/config/env';

type Props = {
  navigation: NativeStackNavigationProp<IncidentStackParamList, 'IncidentReport'>;
};

const SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

async function uploadPhoto(uri: string): Promise<string> {
  const filename = uri.split('/').pop() ?? 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  const formData = new FormData();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append('file', { uri, name: filename, type } as any);

  const { secureStorage } = await import('@/utils/secureStorage');
  const { ACCESS_TOKEN_KEY } = await import('@/config/constants');
  const token = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);

  const response = await fetch(`${ENV.apiUrl}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Photo upload failed');
  }

  const { url } = await response.json() as { url: string };
  return `${ENV.apiUrl}${url}`;
}

export function IncidentReportScreen({ navigation }: Props) {
  const { createIncident, addPhoto } = useIncidentStore();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const canSubmit = title.trim().length > 0 && details.trim().length > 0 && !isSubmitting;

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      RNAlert.alert('Permission required', 'Allow photo access to attach images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setIsUploadingPhoto(true);
    try {
      const url = await uploadPhoto(asset.uri);
      setPhotos((prev) => [...prev, url]);
    } catch {
      RNAlert.alert('Upload failed', 'Could not upload photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const incident = await createIncident({
        title: title.trim(),
        encryptedDetails: details.trim(),
        severity,
      });

      // Attach any uploaded photos
      for (const url of photos) {
        await addPhoto(incident.id, url);
      }

      RNAlert.alert('Submitted', 'Incident report has been filed.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      RNAlert.alert('Error', 'Failed to submit incident report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Incident</Text>
        <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit}>
          <Text style={[styles.submitText, !canSubmit && styles.submitDisabled]}>
            {isSubmitting ? 'Sending...' : 'Submit'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* Severity picker */}
          <Text style={styles.label}>Severity</Text>
          <View style={styles.severityRow}>
            {SEVERITIES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.severityOption,
                  severity === s && { backgroundColor: SEVERITY_COLORS[s] },
                  severity !== s && styles.severityInactive,
                ]}
                onPress={() => setSeverity(s)}
              >
                <Text
                  style={[
                    styles.severityOptionText,
                    severity === s && { color: COLORS.white },
                  ]}
                >
                  {SEVERITY_LABELS[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Brief description of the incident"
            placeholderTextColor={COLORS.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />

          {/* Details */}
          <Text style={styles.label}>Details</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe what happened, who was involved, and any actions taken..."
            placeholderTextColor={COLORS.textMuted}
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          {/* Photos */}
          <Text style={styles.label}>Photos</Text>
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((uri, index) => (
                <View key={index} style={styles.photoThumbContainer}>
                  <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => handleRemovePhoto(index)}
                  >
                    <Text style={styles.removePhotoBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.photoButton, isUploadingPhoto && styles.photoButtonDisabled]}
            onPress={handleAddPhoto}
            disabled={isUploadingPhoto}
          >
            {isUploadingPhoto ? (
              <ActivityIndicator color={COLORS.info} />
            ) : (
              <Text style={styles.photoButtonText}>+ Add Photo</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  cancelText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  headerTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  submitText: {
    ...TYPOGRAPHY.body,
    color: COLORS.info,
    fontWeight: '600',
  },
  submitDisabled: {
    opacity: 0.4,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  label: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  severityRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  severityOption: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  severityInactive: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.gray700,
  },
  severityOptionText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
  },
  textArea: {
    minHeight: 120,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  photoThumbContainer: {
    position: 'relative',
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.sm,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoBtnText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  photoButton: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    borderStyle: 'dashed',
    padding: SPACING.lg,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  photoButtonDisabled: {
    opacity: 0.6,
  },
  photoButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.info,
    fontWeight: '600',
  },
});
