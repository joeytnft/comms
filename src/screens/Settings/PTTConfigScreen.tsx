import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Device } from 'react-native-ble-plx';
import { bluetoothPTTService } from '@/services/bluetoothPTTService';
import { usePTTStore } from '@/store/usePTTStore';
import { ButtonMapping } from '@/types/ptt';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { MoreStackParamList } from '@/navigation/MoreStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<MoreStackParamList, 'PTTConfig'>;
};

const BUTTON_OPTIONS: { value: ButtonMapping; label: string; description: string; platform?: string }[] = [
  {
    value: 'screen_button',
    label: 'On-Screen Button',
    description: 'Use the large PTT button shown on screen.',
  },
  {
    value: 'volume_down',
    label: 'Volume Down Key',
    description: 'Press volume-down to talk. Works on any Android device without accessories.',
    platform: 'android',
  },
  {
    value: 'volume_up',
    label: 'Volume Up Key',
    description: 'Press volume-up to talk.',
    platform: 'android',
  },
  {
    value: 'bluetooth_hid',
    label: 'Bluetooth PTT Button',
    description: 'Pair a dedicated BLE push-to-talk accessory (e.g. Retevis, Baofeng BT-PTT).',
  },
];

export function PTTConfigScreen({ navigation }: Props) {
  const { config, updateConfig } = usePTTStore();
  const [scanning, setScanning] = useState(false);
  const [foundDevices, setFoundDevices] = useState<Device[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [btConnected, setBtConnected] = useState(bluetoothPTTService.isConnected);
  const [bondedId, setBondedId] = useState<string | null>(null);

  useEffect(() => {
    setBtConnected(bluetoothPTTService.isConnected);
    bluetoothPTTService.getBondedDeviceId().then(setBondedId).catch(() => null);
  }, []);

  const handleSelectMapping = (value: ButtonMapping) => {
    updateConfig({ primaryButton: value });
    if (value !== 'bluetooth_hid') {
      setFoundDevices([]);
    }
  };

  const handleScan = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Bluetooth PTT is not available on web.');
      return;
    }
    setFoundDevices([]);
    setScanning(true);
    try {
      await bluetoothPTTService.startScan((device) => {
        setFoundDevices((prev) => {
          if (prev.find((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start scan';
      Alert.alert('Scan failed', msg);
    } finally {
      setTimeout(() => setScanning(false), 15_000);
    }
  };

  const handleStopScan = () => {
    bluetoothPTTService.stopScan();
    setScanning(false);
  };

  const handleConnect = async (device: Device) => {
    setConnecting(device.id);
    try {
      await bluetoothPTTService.connectDevice(device.id);
      setBtConnected(true);
      updateConfig({ primaryButton: 'bluetooth_hid' });
      bluetoothPTTService.getBondedDeviceId().then(setBondedId).catch(() => null);
      Alert.alert('Connected', `Paired with ${device.name ?? device.id}. Press the button to test it.`);
      setFoundDevices([]);
      handleStopScan();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      Alert.alert('Connection failed', msg);
    } finally {
      setConnecting(null);
    }
  };

  const handleForget = () => {
    Alert.alert('Forget Device', 'Remove the paired Bluetooth PTT button?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => {
          bluetoothPTTService.forgetDevice();
          setBtConnected(false);
          setBondedId(null);
          if (config.primaryButton === 'bluetooth_hid') {
            updateConfig({ primaryButton: 'screen_button' });
          }
        },
      },
    ]);
  };

  const visibleOptions = BUTTON_OPTIONS.filter(
    (o) => !o.platform || o.platform === Platform.OS,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PTT Button</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Button Mapping</Text>
        <Text style={styles.sectionDesc}>
          Choose what triggers push-to-talk. Hold to talk, release to stop.
        </Text>

        {visibleOptions.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.optionCard, config.primaryButton === opt.value && styles.optionCardActive]}
            onPress={() => handleSelectMapping(opt.value)}
          >
            <View style={styles.optionRow}>
              <View style={[styles.radio, config.primaryButton === opt.value && styles.radioActive]}>
                {config.primaryButton === opt.value && <View style={styles.radioDot} />}
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, config.primaryButton === opt.value && styles.optionLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </View>
            </View>

            {/* BT status / scan UI — only shown when bluetooth_hid is selected */}
            {opt.value === 'bluetooth_hid' && config.primaryButton === 'bluetooth_hid' && (
              <View style={styles.btSection}>
                {btConnected ? (
                  <View style={styles.btConnected}>
                    <View style={styles.btDot} />
                    <Text style={styles.btConnectedText}>
                      Button connected{bondedId ? ` · ${bondedId.slice(0, 8)}…` : ''}
                    </Text>
                    <TouchableOpacity onPress={handleForget} style={styles.forgetButton}>
                      <Text style={styles.forgetText}>Forget</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.btHint}>
                      {bondedId
                        ? 'Previously paired device not in range. Scan to reconnect or pair a new one.'
                        : 'No button paired yet. Put your PTT accessory in pairing mode and tap Scan.'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.scanButton, scanning && styles.scanButtonActive]}
                      onPress={scanning ? handleStopScan : handleScan}
                    >
                      {scanning
                        ? <ActivityIndicator color={COLORS.white} size="small" />
                        : null}
                      <Text style={styles.scanButtonText}>
                        {scanning ? 'Scanning… (tap to stop)' : 'Scan for Devices'}
                      </Text>
                    </TouchableOpacity>

                    {foundDevices.length > 0 && (
                      <View style={styles.deviceList}>
                        {foundDevices.map((device) => (
                          <TouchableOpacity
                            key={device.id}
                            style={styles.deviceRow}
                            onPress={() => handleConnect(device)}
                            disabled={connecting === device.id}
                          >
                            <View style={styles.deviceInfo}>
                              <Text style={styles.deviceName}>{device.name ?? 'Unknown Device'}</Text>
                              <Text style={styles.deviceId}>{device.id}</Text>
                            </View>
                            {connecting === device.id
                              ? <ActivityIndicator color={COLORS.accent} size="small" />
                              : <Text style={styles.connectText}>Connect</Text>}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {scanning && foundDevices.length === 0 && (
                      <Text style={styles.scanHint}>
                        Looking for HID PTT devices nearby… Make sure your button is in pairing mode.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Background Operation</Text>
          <Text style={styles.infoBody}>
            {Platform.OS === 'android'
              ? 'GatherSafe runs a foreground notification while PTT is active, keeping the channel open when the app is backgrounded. The button will continue to work from your lock screen or while using other apps.'
              : 'On iOS, GatherSafe uses a VoIP audio session to stay connected in the background. The PTT button remains active as long as you do not force-quit the app.'}
          </Text>
        </View>

        {Platform.OS === 'android' && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Volume Key Notes</Text>
            <Text style={styles.infoBody}>
              Volume key intercept requires a small addition to MainActivity.kt. See docs/PTT_IMPLEMENTATION.md for the one-time native setup. BLE PTT buttons work without any native changes.
            </Text>
          </View>
        )}
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  backText: { ...TYPOGRAPHY.body, color: COLORS.info },
  headerTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  sectionTitle: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  sectionDesc: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, marginBottom: SPACING.lg, lineHeight: 20 },
  optionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    ...SHADOWS.sm,
  },
  optionCardActive: { borderColor: COLORS.accent },
  optionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.gray600,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioActive: { borderColor: COLORS.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  optionText: { flex: 1 },
  optionLabel: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  optionLabelActive: { color: COLORS.accent },
  optionDesc: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },
  btSection: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.gray700 },
  btConnected: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  btDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  btConnectedText: { ...TYPOGRAPHY.bodySmall, color: COLORS.success, flex: 1 },
  forgetButton: { paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  forgetText: { ...TYPOGRAPHY.caption, color: COLORS.danger, fontWeight: '600' },
  btHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginBottom: SPACING.sm, lineHeight: 17 },
  scanButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  scanButtonActive: { backgroundColor: COLORS.gray600 },
  scanButtonText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '600' },
  deviceList: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    overflow: 'hidden',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  deviceInfo: { flex: 1 },
  deviceName: { ...TYPOGRAPHY.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  deviceId: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 1 },
  connectText: { ...TYPOGRAPHY.bodySmall, color: COLORS.accent, fontWeight: '600' },
  scanHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: SPACING.md, textAlign: 'center', lineHeight: 17 },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.info,
  },
  infoTitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.info, fontWeight: '700', marginBottom: SPACING.xs },
  infoBody: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, lineHeight: 18 },
});
