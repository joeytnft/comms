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
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';
import { IncidentStackParamList } from '@/navigation/IncidentStackNavigator';
import { apiClient } from '@/api/client';

type Props = {
  navigation: NativeStackNavigationProp<IncidentStackParamList, 'IncidentReport'>;
};

const SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

async function uploadPhoto(uri: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  const ext = mimeType.split('/')[1] ?? 'jpg';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append('file', { uri, type: mimeType, name: `photo.${ext}` } as any);

  // Do NOT set Content-Type — axios sets it with the multipart boundary automatically.
  const res = await apiClient.post<{ url: string }>('/upload', formData);
  return res.data.url;
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

  const pickAndUpload = async (source: 'camera' | 'library') => {
    // Request the appropriate permission
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        RNAlert.alert('Permission required', 'Allow camera access to take photos.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        RNAlert.alert('Permission required', 'Allow photo library access to attach images.');
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: 'images',
      quality: 0.7,
      allowsMultipleSelection: false,
    };

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    setIsUploadingPhoto(true);
    try {
      const url = await uploadPhoto(asset.uri, mimeType);
      setPhotos((prev) => [...prev, url]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not upload photo. Please try again.';
      RNAlert.alert('Upload failed', msg);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleAddPhoto = () => {
    RNAlert.alert('Add Photo', 'Choose a source', [
      { text: 'Take Photo', onPress: () => pickAndUpload('camera') },
      { text: 'Choose from Library', onPress: () => pickAndUpload('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
