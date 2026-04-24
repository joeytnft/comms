import { Platform, NativeModules } from 'react-native';
// Type-only imports are erased at runtime — safe even when the native module is absent.
import type {
  CustomerInfo,
  PurchasesOfferings,
} from 'react-native-purchases';
import type RevenueCatUI from 'react-native-purchases-ui';
import type { PAYWALL_RESULT } from 'react-native-purchases-ui';
import {
  REVENUECAT_IOS_API_KEY,
  REVENUECAT_ANDROID_API_KEY,
  REVENUECAT_ENTITLEMENT_STARTER,
  REVENUECAT_ENTITLEMENT_TEAM,
  REVENUECAT_ENTITLEMENT_PRO,
} from '@/config/constants';

const PAID_ENTITLEMENTS = [
  REVENUECAT_ENTITLEMENT_PRO,
  REVENUECAT_ENTITLEMENT_TEAM,
  REVENUECAT_ENTITLEMENT_STARTER,
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySDK = any;

// Dynamic requires prevent a crash when the native module isn't linked (e.g. Expo Go).
// NativeModules.RNPurchases is present in both old-arch and new-arch interop mode.
let _sdk: AnySDK = null;
let _sdkChecked = false;
let _RevenueCatUI: AnySDK = null;
let _PAYWALL_RESULT: AnySDK = null;

function loadSDK(): AnySDK {
  if (_sdkChecked) return _sdk;
  _sdkChecked = true;
  if (!NativeModules.RNPurchases) return null;
  try {
    const mod = require('react-native-purchases');
    // LOG_LEVEL is a named export, not a property of the default Purchases class.
    // Merge it onto the SDK reference so callers can do sdk.LOG_LEVEL.
    const PurchasesClass = mod.default ?? mod;
    _sdk = Object.assign(PurchasesClass, { LOG_LEVEL: mod.LOG_LEVEL ?? PurchasesClass.LOG_LEVEL });
  } catch {
    _sdk = null;
  }
  return _sdk;
}

function loadUI(): { sdk: typeof RevenueCatUI; PAYWALL_RESULT: typeof PAYWALL_RESULT } | null {
  if (_RevenueCatUI && _PAYWALL_RESULT) {
    return { sdk: _RevenueCatUI, PAYWALL_RESULT: _PAYWALL_RESULT };
  }
  if (!NativeModules.RNPurchases) return null;
  try {
    const mod = require('react-native-purchases-ui');
    _RevenueCatUI = mod.default ?? mod;
    _PAYWALL_RESULT = mod.PAYWALL_RESULT;
    return { sdk: _RevenueCatUI, PAYWALL_RESULT: _PAYWALL_RESULT };
  } catch {
    return null;
  }
}

export const revenueCatService = {
  configure(userId?: string): void {
    const sdk = loadSDK();
    if (!sdk) {
      if (__DEV__) {
        console.warn(
          '[RevenueCat] Native module unavailable — skipping configure. ' +
          'Use a development build (not Expo Go) for full functionality.',
        );
      }
      return;
    }

    try {
      if (__DEV__ && sdk.LOG_LEVEL) {
        sdk.setLogLevel(sdk.LOG_LEVEL.VERBOSE);
      }
      const apiKey =
        Platform.OS === 'ios' ? REVENUECAT_IOS_API_KEY : REVENUECAT_ANDROID_API_KEY;
      sdk.configure({ apiKey, appUserID: userId ?? null });
    } catch (e) {
      if (__DEV__) {
        console.warn('[RevenueCat] configure() failed:', e);
      }
    }
  },

  async identify(userId: string): Promise<CustomerInfo | null> {
    const sdk = loadSDK();
    if (!sdk) return null;
    const { customerInfo } = await sdk.logIn(userId);
    return customerInfo;
  },

  async logOut(): Promise<CustomerInfo | null> {
    const sdk = loadSDK();
    if (!sdk) return null;
    return sdk.logOut();
  },

  async getCustomerInfo(): Promise<CustomerInfo | null> {
    const sdk = loadSDK();
    if (!sdk) return null;
    return sdk.getCustomerInfo();
  },

  async getOfferings(): Promise<PurchasesOfferings | null> {
    const sdk = loadSDK();
    if (!sdk) return null;
    return sdk.getOfferings();
  },

  /** Returns true if the customer has any active paid entitlement. */
  hasAnyPaidEntitlement(customerInfo: CustomerInfo): boolean {
    return PAID_ENTITLEMENTS.some(
      (id) => typeof customerInfo.entitlements.active[id] !== 'undefined',
    );
  },

  /** Returns true if the customer has a specific entitlement active. */
  hasEntitlement(customerInfo: CustomerInfo, entitlementId: string): boolean {
    return typeof customerInfo.entitlements.active[entitlementId] !== 'undefined';
  },

  async restorePurchases(): Promise<CustomerInfo | null> {
    const sdk = loadSDK();
    if (!sdk) return null;
    return sdk.restorePurchases();
  },

  async presentPaywall(): Promise<boolean> {
    const ui = loadUI();
    if (!ui) return false;
    const result = await ui.sdk.presentPaywall();
    const { PAYWALL_RESULT: PR } = ui;
    return result === PR.PURCHASED || result === PR.RESTORED;
  },

  async presentCustomerCenter(): Promise<void> {
    const ui = loadUI();
    if (!ui) return;
    await ui.sdk.presentCustomerCenter();
  },
};
