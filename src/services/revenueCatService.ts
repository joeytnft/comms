import { Platform, NativeModules } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  CustomerInfo,
  PurchasesOfferings,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
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

function isNativeModuleAvailable(): boolean {
  return Boolean(NativeModules.RNPurchases);
}

export const revenueCatService = {
  configure(userId?: string): void {
    if (!isNativeModuleAvailable()) {
      if (__DEV__) {
        console.warn('[RevenueCat] Native module unavailable — skipping configure (use a dev build, not Expo Go)');
      }
      return;
    }

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
    }

    const apiKey =
      Platform.OS === 'ios' ? REVENUECAT_IOS_API_KEY : REVENUECAT_ANDROID_API_KEY;

    Purchases.configure({ apiKey, appUserID: userId ?? null });
  },

  async identify(userId: string): Promise<CustomerInfo | null> {
    if (!isNativeModuleAvailable()) return null;
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  },

  async logOut(): Promise<CustomerInfo | null> {
    if (!isNativeModuleAvailable()) return null;
    return Purchases.logOut();
  },

  async getCustomerInfo(): Promise<CustomerInfo | null> {
    if (!isNativeModuleAvailable()) return null;
    return Purchases.getCustomerInfo();
  },

  async getOfferings(): Promise<PurchasesOfferings | null> {
    if (!isNativeModuleAvailable()) return null;
    return Purchases.getOfferings();
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
    if (!isNativeModuleAvailable()) return null;
    return Purchases.restorePurchases();
  },

  async presentPaywall(): Promise<boolean> {
    if (!isNativeModuleAvailable()) return false;
    const result: PAYWALL_RESULT = await RevenueCatUI.presentPaywall();
    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
        return true;
      default:
        return false;
    }
  },

  async presentCustomerCenter(): Promise<void> {
    if (!isNativeModuleAvailable()) return;
    await RevenueCatUI.presentCustomerCenter();
  },
};
