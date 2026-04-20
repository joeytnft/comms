import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert as RNAlert,
  Vibration,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { ENV } from '@/config/env';
import { useAlertStore } from '@/store/useAlertStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useAuth } from '@/contexts/AuthContext';
import { useCampusViewStore } from '@/store/useCampusViewStore';
import { useCampusStore } from '@/store/useCampusStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { CampusSwitcher } from '@/components/common/CampusSwitcher';
import {
  Alert,
  AlertLevel,
  AlertTypeKey,
  AlertTypeDef,
  CustomAlertType,
  ALERT_TYPE_DEFS,
  ALERT_TYPE_KEYS,
  ALERT_COLORS,
  ALERT_LABELS,
  CUSTOM_ALERT_TYPES_KEY,
} from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

// ── Alert tone (expo-av) ────────────────────────────────────────────────────
async function playAlertTone() {
  try {
    Vibration.vibrate([0, 300, 100, 300, 100, 600]);
  } catch {}
}

const EMOJI_OPTIONS = ['🚨','⚠️','🆘','🔔','💥','🛑','☢️','🧯','🩺','👮','🚒','🚑','🔫','💊','🏃','📢','🌪️','🌊','💣','🔴'];
const COLOR_OPTIONS = [
  '#EF4444','#F97316','#F59E0B','#10B981','#3B82F6','#8B5CF6',
  '#EC4899','#111827','#DC2626','#2563EB','#059669','#7C3AED',
];
const LEVEL_OPTIONS: AlertLevel[] = ['ATTENTION', 'WARNING', 'EMERGENCY'];

interface ConfirmState {
  visible: boolean;
  alertType: AlertTypeKey | null;
  customType: CustomAlertType | null;
}

export function AlertsScreen() {
  const { user } = useAuth();
  const {
    alerts,
    activeAlerts,
    isLoading,
    error,
    fetchAlerts,
    triggerAlert,
    acknowledgeAlert,
    resolveAlert,
    deleteAlert,
  } = useAlertStore();
  const { groups, fetchGroups } = useGroupStore();
  const { activeCampusId } = useCampusViewStore();
  const { fetchCampuses } = useCampusStore();
  const { subscription } = useSubscriptionStore();

  const [showHistory, setShowHistory] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>({ visible: false, alertType: null, customType: null });
  const [message, setMessage] = useState('');
  const [priorityTone, setPriorityTone] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[] | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // Custom alert types
  const [customTypes, setCustomTypes] = useState<CustomAlertType[]>([]);
  const [showCreateCustom, setShowCreateCustom] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newEmoji, setNewEmoji] = useState(EMOJI_OPTIONS[0]);
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);
  const [newLevel, setNewLevel] = useState<AlertLevel>('WARNING');

  const myAlertGroups = groups.filter((g) => g.alertsEnabled);

  useFocusEffect(
    useCallback(() => {
      if (subscription?.tier === 'PRO') fetchCampuses();
      fetchAlerts({ active: true, campusId: activeCampusId });
      if (groups.length === 0) fetchGroups(activeCampusId);
    }, [activeCampusId]),
  );

  // Load custom types from SecureStore on mount
  useEffect(() => {
    SecureStore.getItemAsync(CUSTOM_ALERT_TYPES_KEY).then((json) => {
      if (json) {
        try { setCustomTypes(JSON.parse(json)); } catch {}
      }
    });
  }, []);

  const saveCustomTypes = async (types: CustomAlertType[]) => {
    setCustomTypes(types);
    await SecureStore.setItemAsync(CUSTOM_ALERT_TYPES_KEY, JSON.stringify(types));
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      RNAlert.alert('Permission needed', 'Allow photo access to attach images to alerts.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        base64: asset.base64 ?? '',
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      RNAlert.alert('Permission needed', 'Allow camera access to take photos for alerts.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        base64: asset.base64 ?? '',
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const handleCreateCustomType = async () => {
    if (!newLabel.trim()) return;
    const newType: CustomAlertType = {
      id: Date.now().toString(),
      label: newLabel.trim(),
      description: newDescription.trim() || newLabel.trim(),
      color: newColor,
      emoji: newEmoji,
      defaultLevel: newLevel,
    };
    await saveCustomTypes([...customTypes, newType]);
    setShowCreateCustom(false);
    setNewLabel('');
    setNewDescription('');
    setNewEmoji(EMOJI_OPTIONS[0]);
    setNewColor(COLOR_OPTIONS[0]);
    setNewLevel('WARNING');
  };

  const handleDeleteCustomType = (id: string) => {
    RNAlert.alert('Remove Custom Alert', 'Remove this custom alert type?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => saveCustomTypes(customTypes.filter((t) => t.id !== id)),
      },
    ]);
  };

  const openConfirm = (alertType: AlertTypeKey | null, customType: CustomAlertType | null) => {
    setMessage('');
    setPriorityTone(true);
    setLocation(null);
    setPhoto(null);
    setSelectedGroupIds(null);
    setConfirm({ visible: true, alertType, customType });

    setLocating(true);
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') { setLocating(false); return; }
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((loc) => setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }))
        .catch(() => null)
        .finally(() => setLocating(false));
    });
  };

  // Resolve the active def (built-in or custom)
  const activeDef: (AlertTypeDef & { isCustom?: boolean }) | null = confirm.alertType
    ? ALERT_TYPE_DEFS[confirm.alertType]
    : confirm.customType
      ? {
          label: confirm.customType.label,
          description: confirm.customType.description,
          color: confirm.customType.color,
          textColor: '#FFFFFF',
          emoji: confirm.customType.emoji,
          defaultLevel: confirm.customType.defaultLevel,
          isCustom: true,
        }
      : null;

  const handleSend = async () => {
    if (!activeDef) return;
    setConfirm({ visible: false, alertType: null, customType: null });
    setTriggering(true);
    try {
      if (priorityTone) await playAlertTone();

      // Upload photo if attached
      let photoUrl: string | undefined;
      if (photo?.base64) {
        setUploading(true);
        try {
          const res = await apiClient.post<{ url: string }>(ENDPOINTS.UPLOAD, {
            data: photo.base64,
            mimeType: photo.mimeType,
          });
          photoUrl = res.url;
        } finally {
          setUploading(false);
        }
      }

      await triggerAlert({
        level: activeDef.defaultLevel,
        alertType: confirm.alertType ?? undefined,
        message: confirm.customType
          ? `[${confirm.customType.emoji} ${confirm.customType.label}]${message.trim() ? ` ${message.trim()}` : ''}`
          : message.trim() || undefined,
        latitude: location?.latitude,
        longitude: location?.longitude,
        priorityTone,
        photoUrl,
        groupIds: selectedGroupIds ?? undefined,
      });
    } catch {
      RNAlert.alert('Error', 'Failed to send alert. Please try again.');
    } finally {
      setTriggering(false);
      setUploading(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try { await acknowledgeAlert(id); } catch {
      RNAlert.alert('Error', 'Failed to acknowledge alert');
    }
  };

  const handleResolve = (id: string) => {
    RNAlert.alert('Resolve Alert', 'Mark this alert as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', onPress: async () => { try { await resolveAlert(id); } catch { RNAlert.alert('Error', 'Failed to resolve alert'); } } },
    ]);
  };

  const handleDelete = (id: string) => {
    RNAlert.alert('Delete Alert', 'Permanently delete this alert from the log?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await deleteAlert(id); } catch { RNAlert.alert('Error', 'Failed to delete alert'); }
        },
      },
    ]);
  };

  const toggleGroup = (groupId: string) => {
    if (selectedGroupIds === null) { setSelectedGroupIds([groupId]); return; }
    const next = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId];
    setSelectedGroupIds(next.length === 0 ? null : next);
  };

  const displayAlerts = showHistory ? alerts : activeAlerts;
  const userId = user?.id;

  const renderAlert = ({ item }: { item: Alert }) => {
    const isAcked = item.acknowledgments.some((a) => a.userId === userId);
    const isResolved = !!item.resolvedAt;
    const typeDef = item.alertType ? ALERT_TYPE_DEFS[item.alertType] : null;
    const badgeColor = typeDef?.color ?? ALERT_COLORS[item.level];
    const badgeLabel = typeDef ? `${typeDef.emoji} ${typeDef.label}` : ALERT_LABELS[item.level];
    const isGlobal = item.targetGroups.length === 0;
    const isOwner = item.triggeredBy.id === userId;

    return (
      <View style={[styles.alertCard, { borderLeftColor: badgeColor }]}>
        <View style={styles.alertHeader}>
          <View style={[styles.levelBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.levelBadgeText}>{badgeLabel}</Text>
          </View>
          {isResolved && (
            <View style={styles.resolvedBadge}>
              <Text style={styles.resolvedBadgeText}>RESOLVED</Text>
            </View>
          )}
        </View>

        {item.message ? <Text style={styles.alertMessage}>{item.message}</Text> : null}

        {item.photoUrl ? (
          <TouchableOpacity onPress={() => setViewingPhoto(
            item.photoUrl!.startsWith('http') ? item.photoUrl! : `${ENV.apiUrl}${item.photoUrl}`
          )}>
            <Image
              source={{ uri: item.photoUrl.startsWith('http') ? item.photoUrl : `${ENV.apiUrl}${item.photoUrl}` }}
              style={styles.alertPhoto}
              resizeMode="cover"
            />
            <Text style={styles.alertPhotoHint}>Tap to view full image</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.alertMeta}>
          {item.triggeredBy.displayName}
          {item.latitude != null
            ? `  ·  📍 ${item.latitude.toFixed(4)}, ${item.longitude!.toFixed(4)}`
            : ''}
          {'  ·  '}{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>

        <View style={styles.alertFooter}>
          <Text style={styles.ackCount}>{item.acknowledgments.length} acknowledged</Text>
          <View style={styles.scopePill}>
            <Text style={styles.scopePillText}>
              {isGlobal ? 'All Channels' : item.targetGroups.map((t) => t.group.name).join(', ')}
            </Text>
          </View>
        </View>

        {!isResolved && (
          <View style={styles.alertActions}>
            {!isAcked && (
              <TouchableOpacity style={styles.ackButton} onPress={() => handleAcknowledge(item.id)}>
                <Text style={styles.ackButtonText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.resolveButton} onPress={() => handleResolve(item.id)}>
              <Text style={styles.resolveButtonText}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}

        {isOwner && (
          <TouchableOpacity style={styles.deleteAlertButton} onPress={() => handleDelete(item.id)}>
            <Text style={styles.deleteAlertText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <View style={styles.headerRight}>
          <CampusSwitcher />
          <TouchableOpacity onPress={() => { if (!showHistory) fetchAlerts({ campusId: activeCampusId }); setShowHistory(!showHistory); }}>
            <Text style={styles.historyToggle}>{showHistory ? 'Active Only' : 'History'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Alert type grid */}
      <View style={styles.gridSection}>
        <Text style={styles.gridLabel}>TAP TO SEND ALERT</Text>
        <View style={styles.grid}>
          {ALERT_TYPE_KEYS.map((key) => {
            const d = ALERT_TYPE_DEFS[key];
            return (
              <TouchableOpacity
                key={key}
                style={[styles.typeButton, { backgroundColor: d.color }]}
                onPress={() => openConfirm(key, null)}
                disabled={triggering}
                activeOpacity={0.75}
              >
                <Text style={styles.typeEmoji}>{d.emoji}</Text>
                <Text style={styles.typeLabel}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Custom alert type tiles */}
          {customTypes.map((ct) => (
            <TouchableOpacity
              key={ct.id}
              style={[styles.typeButton, { backgroundColor: ct.color }]}
              onPress={() => openConfirm(null, ct)}
              onLongPress={() => handleDeleteCustomType(ct.id)}
              disabled={triggering}
              activeOpacity={0.75}
            >
              <Text style={styles.typeEmoji}>{ct.emoji}</Text>
              <Text style={styles.typeLabel}>{ct.label}</Text>
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeText}>CUSTOM</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Add custom type button */}
          <TouchableOpacity
            style={styles.addCustomButton}
            onPress={() => setShowCreateCustom(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.addCustomPlus}>+</Text>
            <Text style={styles.addCustomLabel}>Custom</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        {showHistory ? 'Alert History' : `Active Alerts (${activeAlerts.length})`}
      </Text>
      <FlatList
        data={displayAlerts}
        renderItem={renderAlert}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => fetchAlerts({ active: !showHistory })}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{showHistory ? 'No alert history' : 'No active alerts'}</Text>
            <Text style={styles.emptySubtext}>All clear</Text>
          </View>
        }
      />

      {/* ── Send confirm modal ─────────────────────────────────────────────── */}
      {activeDef && (
        <Modal
          visible={confirm.visible}
          transparent
          animationType="slide"
          onRequestClose={() => setConfirm({ visible: false, alertType: null, customType: null })}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalCard}>
              <View style={[styles.modalTypeHeader, { backgroundColor: activeDef.color }]}>
                <Text style={styles.modalTypeEmoji}>{activeDef.emoji}</Text>
                <View>
                  <Text style={styles.modalTypeLabel}>{activeDef.label}</Text>
                  <Text style={styles.modalTypeDesc}>{activeDef.description}</Text>
                </View>
              </View>

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>👤</Text>
                  <Text style={styles.infoText}>{user?.displayName ?? 'You'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>📍</Text>
                  {locating
                    ? <ActivityIndicator size="small" color={COLORS.accent} />
                    : <Text style={styles.infoText}>
                        {location
                          ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                          : 'Location unavailable'}
                      </Text>
                  }
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>🕐</Text>
                  <Text style={styles.infoText}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>

                <TextInput
                  style={styles.noteInput}
                  placeholder="Add a note (optional)"
                  placeholderTextColor={COLORS.textMuted}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={200}
                />

                {/* Photo attachment */}
                <View style={styles.photoSection}>
                  <Text style={styles.photoSectionLabel}>ATTACH PHOTO</Text>
                  {photo ? (
                    <View style={styles.photoPreviewRow}>
                      <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
                      <View style={styles.photoPreviewActions}>
                        <TouchableOpacity style={styles.photoActionBtn} onPress={handlePickPhoto}>
                          <Text style={styles.photoActionText}>Replace</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.photoActionBtn, styles.photoRemoveBtn]} onPress={() => setPhoto(null)}>
                          <Text style={styles.photoRemoveText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoPickerRow}>
                      <TouchableOpacity style={styles.photoPickerBtn} onPress={handleTakePhoto}>
                        <Text style={styles.photoPickerIcon}>📷</Text>
                        <Text style={styles.photoPickerText}>Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.photoPickerBtn} onPress={handlePickPhoto}>
                        <Text style={styles.photoPickerIcon}>🖼️</Text>
                        <Text style={styles.photoPickerText}>Library</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {myAlertGroups.length > 0 && (
                  <View style={styles.scopeSection}>
                    <Text style={styles.scopeSectionLabel}>NOTIFY</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <TouchableOpacity
                        style={[styles.chip, selectedGroupIds === null && styles.chipActive]}
                        onPress={() => setSelectedGroupIds(null)}
                      >
                        <Text style={[styles.chipText, selectedGroupIds === null && styles.chipTextActive]}>
                          All Channels
                        </Text>
                      </TouchableOpacity>
                      {myAlertGroups.map((g) => {
                        const sel = selectedGroupIds?.includes(g.id) ?? false;
                        return (
                          <TouchableOpacity
                            key={g.id}
                            style={[styles.chip, sel && styles.chipActive]}
                            onPress={() => toggleGroup(g.id)}
                          >
                            <Text style={[styles.chipText, sel && styles.chipTextActive]}>{g.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.toneRow}>
                  <View>
                    <Text style={styles.toneLabel}>Priority Alert Tone</Text>
                    <Text style={styles.toneDesc}>Play loud alert + vibrate on send</Text>
                  </View>
                  <Switch
                    value={priorityTone}
                    onValueChange={setPriorityTone}
                    trackColor={{ false: COLORS.gray700, true: activeDef.color + '80' }}
                    thumbColor={priorityTone ? activeDef.color : COLORS.gray500}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: activeDef.color }, (triggering || uploading) && styles.confirmButtonDisabled]}
                  onPress={handleSend}
                  disabled={triggering || uploading}
                >
                  {uploading
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.confirmButtonText}>SEND {activeDef.label.toUpperCase()} ALERT</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setConfirm({ visible: false, alertType: null, customType: null })}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ── Full-screen photo viewer ─────────────────────────────────────── */}
      <Modal
        visible={!!viewingPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingPhoto(null)}
      >
        <TouchableOpacity
          style={styles.photoViewerOverlay}
          activeOpacity={1}
          onPress={() => setViewingPhoto(null)}
        >
          {viewingPhoto && (
            <Image
              source={{ uri: viewingPhoto }}
              style={styles.photoViewerImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.photoViewerHint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      {/* ── Create custom alert type modal ───────────────────────────────── */}
      <Modal
        visible={showCreateCustom}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateCustom(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={[styles.modalTypeHeader, { backgroundColor: newColor }]}>
              <Text style={styles.modalTypeEmoji}>{newEmoji}</Text>
              <View>
                <Text style={styles.modalTypeLabel}>{newLabel || 'New Alert Type'}</Text>
                <Text style={styles.modalTypeDesc}>Custom alert</Text>
              </View>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.customInput}
                placeholder="Alert name *"
                placeholderTextColor={COLORS.textMuted}
                value={newLabel}
                onChangeText={setNewLabel}
                maxLength={30}
              />
              <TextInput
                style={styles.customInput}
                placeholder="Description (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={newDescription}
                onChangeText={setNewDescription}
                maxLength={80}
              />

              {/* Emoji picker */}
              <Text style={styles.pickerLabel}>ICON</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
                {EMOJI_OPTIONS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[styles.emojiOption, newEmoji === e && styles.emojiOptionSelected]}
                    onPress={() => setNewEmoji(e)}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Color picker */}
              <Text style={styles.pickerLabel}>COLOR</Text>
              <View style={styles.colorRow}>
                {COLOR_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, newColor === c && styles.colorDotSelected]}
                    onPress={() => setNewColor(c)}
                  />
                ))}
              </View>

              {/* Level picker */}
              <Text style={styles.pickerLabel}>SEVERITY</Text>
              <View style={styles.levelRow}>
                {LEVEL_OPTIONS.map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.levelOption, newLevel === l && styles.levelOptionSelected]}
                    onPress={() => setNewLevel(l)}
                  >
                    <Text style={[styles.levelOptionText, newLevel === l && styles.levelOptionTextSelected]}>
                      {l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: newColor }, !newLabel.trim() && styles.confirmButtonDisabled]}
                onPress={handleCreateCustomType}
                disabled={!newLabel.trim()}
              >
                <Text style={styles.confirmButtonText}>CREATE ALERT TYPE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreateCustom(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { ...TYPOGRAPHY.heading1, color: COLORS.textPrimary },
  historyToggle: { ...TYPOGRAPHY.bodySmall, color: COLORS.info, fontWeight: '600' },

  gridSection: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  gridLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  typeButton: {
    width: '48%',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  typeEmoji: { fontSize: 28, marginBottom: 4 },
  typeLabel: { ...TYPOGRAPHY.bodySmall, color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  customBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  customBadgeText: { fontSize: 8, color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.5 },
  addCustomButton: {
    width: '48%',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.gray700,
    borderStyle: 'dashed',
    ...SHADOWS.sm,
  },
  addCustomPlus: { fontSize: 28, color: COLORS.textMuted, marginBottom: 4, fontWeight: '300' },
  addCustomLabel: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, fontWeight: '600' },

  sectionTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  errorContainer: { alignItems: 'center', paddingVertical: SPACING.sm },
  errorText: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger },
  emptyContainer: { alignItems: 'center', paddingTop: SPACING.xl },
  emptyText: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  emptySubtext: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.xs },

  alertCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  alertHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  levelBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: 4 },
  levelBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '700' },
  resolvedBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: 4, backgroundColor: COLORS.success },
  resolvedBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '700' },
  alertMessage: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  alertMeta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, lineHeight: 18 },
  alertFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  ackCount: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  scopePill: { backgroundColor: COLORS.gray700, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 4 },
  scopePillText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  alertActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  ackButton: { flex: 1, backgroundColor: COLORS.info, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.sm, alignItems: 'center' },
  ackButtonText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '600' },
  resolveButton: { flex: 1, backgroundColor: COLORS.success, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.sm, alignItems: 'center' },
  resolveButtonText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '600' },
  deleteAlertButton: { alignItems: 'center', paddingTop: SPACING.sm, marginTop: SPACING.xs, borderTopWidth: 1, borderTopColor: COLORS.gray700 },
  deleteAlertText: { ...TYPOGRAPHY.caption, color: COLORS.danger, fontWeight: '600' },
  alertPhoto: {
    width: '100%',
    height: 180,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gray700,
  },
  alertPhotoHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, textAlign: 'center', marginTop: 2 },

  // Photo picker (in confirm modal)
  photoSection: { marginBottom: SPACING.md },
  photoSectionLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 1, marginBottom: SPACING.sm },
  photoPickerRow: { flexDirection: 'row', gap: SPACING.sm },
  photoPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.md,
  },
  photoPickerIcon: { fontSize: 20 },
  photoPickerText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  photoPreviewRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  photoPreview: { width: 100, height: 75, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.gray700 },
  photoPreviewActions: { flex: 1, gap: SPACING.xs },
  photoActionBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.xs + 2,
    alignItems: 'center',
  },
  photoActionText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontWeight: '600' },
  photoRemoveBtn: { borderColor: COLORS.danger },
  photoRemoveText: { ...TYPOGRAPHY.caption, color: COLORS.danger, fontWeight: '600' },

  // Full-screen photo viewer
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerImage: { width: '100%', height: '80%' },
  photoViewerHint: { ...TYPOGRAPHY.caption, color: 'rgba(255,255,255,0.5)', marginTop: SPACING.md },

  // Modal shared
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg * 2,
    borderTopRightRadius: BORDER_RADIUS.lg * 2,
    overflow: 'hidden',
    maxHeight: '92%',
  },
  modalTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  modalTypeEmoji: { fontSize: 40 },
  modalTypeLabel: { ...TYPOGRAPHY.heading2, color: '#FFFFFF', fontWeight: '800' },
  modalTypeDesc: { ...TYPOGRAPHY.bodySmall, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  modalBody: { padding: SPACING.lg, maxHeight: 420 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  infoIcon: { fontSize: 16, width: 22 },
  infoText: { ...TYPOGRAPHY.body, color: COLORS.textPrimary },
  noteInput: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    color: COLORS.textPrimary,
    padding: SPACING.md,
    minHeight: 64,
    textAlignVertical: 'top',
    ...TYPOGRAPHY.body,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  scopeSection: { marginBottom: SPACING.md },
  scopeSectionLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 1, marginBottom: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  chipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '22' },
  chipText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: COLORS.accent },
  toneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray700,
  },
  toneLabel: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  toneDesc: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  modalActions: { padding: SPACING.lg, gap: SPACING.sm },
  confirmButton: {
    paddingVertical: SPACING.md + 2,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  confirmButtonDisabled: { opacity: 0.4 },
  confirmButtonText: { ...TYPOGRAPHY.body, color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.5 },
  cancelButton: { alignItems: 'center', paddingVertical: SPACING.sm },
  cancelButtonText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },

  // Create custom modal extras
  customInput: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    color: COLORS.textPrimary,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    marginBottom: SPACING.sm,
  },
  pickerLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  emojiRow: { marginBottom: SPACING.sm },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiOptionSelected: { borderColor: COLORS.accent },
  emojiText: { fontSize: 22 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: { borderColor: COLORS.white, borderWidth: 3 },
  levelRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  levelOption: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  levelOptionSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '22' },
  levelOptionText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontWeight: '700' },
  levelOptionTextSelected: { color: COLORS.accent },
});
