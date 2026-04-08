/**
 * Bluetooth PTT Service
 *
 * Scans for and bonds with BLE HID PTT accessories (e.g. Retevis, Baofeng BT-PTT,
 * generic USB/BT push-to-talk buttons). These devices advertise the HID service UUID
 * (0x1812) and send key-down/key-up reports on button press.
 *
 * The service also tracks bonded PTT devices across restarts via MMKV so the user
 * doesn't need to re-pair every session.
 */

import { Platform } from 'react-native';
import { BleManager, Device, State, BleError } from 'react-native-ble-plx';
import { secureStorage } from '@/utils/secureStorage';
import { logger } from '@/utils/logger';

// HID service UUID (standard Bluetooth SIG)
const HID_SERVICE_UUID = '00001812-0000-1000-8000-00805f9b34fb';
// HID Report Characteristic
const HID_REPORT_UUID = '00002a4d-0000-1000-8000-00805f9b34fb';

type PTTButtonEvent = 'press' | 'release';
type ButtonListener = (event: PTTButtonEvent) => void;

const BONDED_DEVICE_KEY = 'guardian_ptt_bonded_device';

class BluetoothPTTService {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private listeners: Set<ButtonListener> = new Set();
  private isScanning = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Must be called once at app startup (outside React tree) */
  init() {
    if (Platform.OS === 'web') return;
    try {
      this.manager = new BleManager();
      // Monitor BLE adapter state
      this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          this.reconnectBonded();
        }
      }, true);
    } catch {
      // BLE native module not available (Expo Go). BT PTT will be disabled.
      this.manager = null;
    }
  }

  /** Subscribe to PTT button press/release events */
  addListener(listener: ButtonListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: PTTButtonEvent) {
    this.listeners.forEach((l) => l(event));
  }

  /** Scan for nearby BLE HID PTT devices */
  async startScan(onFound: (device: Device) => void): Promise<void> {
    if (!this.manager || this.isScanning) return;

    const state = await this.manager.state();
    if (state !== State.PoweredOn) {
      throw new Error('Bluetooth is not enabled. Please turn on Bluetooth and try again.');
    }

    this.isScanning = true;

    this.manager.startDeviceScan(
      [HID_SERVICE_UUID],
      { allowDuplicates: false },
      (error: BleError | null, device: Device | null) => {
        if (error) {
          logger.warn({ err: error }, '[BT-PTT] Scan error');
          this.isScanning = false;
          return;
        }
        if (device && device.name) {
          onFound(device);
        }
      },
    );

    // Auto-stop scan after 15 seconds to save battery
    setTimeout(() => this.stopScan(), 15_000);
  }

  stopScan() {
    this.manager?.stopDeviceScan();
    this.isScanning = false;
  }

  /** Connect to a specific BLE HID device and subscribe to its button reports */
  async connectDevice(deviceId: string): Promise<Device> {
    if (!this.manager) throw new Error('BLE not initialized');

    this.stopScan();
    this.disconnect();

    const device = await this.manager.connectToDevice(deviceId, {
      autoConnect: true,
      timeout: 10_000,
    });

    await device.discoverAllServicesAndCharacteristics();
    this.connectedDevice = device;

    // Persist for auto-reconnect
    secureStorage.setItemAsync(BONDED_DEVICE_KEY, deviceId).catch(() => null);

    // Subscribe to HID report characteristic for button events
    device.monitorCharacteristicForService(
      HID_SERVICE_UUID,
      HID_REPORT_UUID,
      (error, characteristic) => {
        if (error) {
          logger.warn({ err: error }, '[BT-PTT] HID monitor error');
          this.handleDisconnect(deviceId);
          return;
        }
        if (characteristic?.value) {
          // HID reports: non-zero value = key down, zero = key up
          const bytes = Buffer.from(characteristic.value, 'base64');
          const isKeyDown = bytes.some((b) => b !== 0);
          this.emit(isKeyDown ? 'press' : 'release');
        }
      },
    );

    // Watch for disconnection
    device.onDisconnected(() => this.handleDisconnect(deviceId));

    logger.info(`[BT-PTT] Connected to ${device.name ?? deviceId}`);
    return device;
  }

  private handleDisconnect(deviceId: string) {
    logger.info(`[BT-PTT] Device ${deviceId} disconnected — will retry in 5s`);
    this.connectedDevice = null;
    // Auto-reconnect
    this.reconnectTimer = setTimeout(() => this.reconnectBonded(), 5_000);
  }

  private async reconnectBonded() {
    const savedId = await secureStorage.getItemAsync(BONDED_DEVICE_KEY);
    if (!savedId || this.connectedDevice) return;
    try {
      await this.connectDevice(savedId);
    } catch {
      // Retry silently — device may not be in range
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectedDevice?.cancelConnection().catch(() => null);
    this.connectedDevice = null;
  }

  /** Remove the bonded device and stop auto-reconnect */
  forgetDevice() {
    this.disconnect();
    secureStorage.deleteItemAsync(BONDED_DEVICE_KEY).catch(() => null);
  }

  get isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  async getBondedDeviceId(): Promise<string | null> {
    return secureStorage.getItemAsync(BONDED_DEVICE_KEY);
  }
}

export const bluetoothPTTService = new BluetoothPTTService();
