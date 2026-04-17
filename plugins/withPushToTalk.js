/**
 * Expo config plugin — Apple Push To Talk framework integration.
 *
 * What this does during `expo prebuild` / EAS Build:
 *  1. Writes the Swift + ObjC bridge files into the Xcode project directory.
 *  2. Registers them in the .pbxproj under a PushToTalkModule group.
 *  3. Adds PushToTalk.framework (weak-linked for iOS <16 safety).
 *  4. Sets the `push-to-talk` UIBackgroundMode.
 *  5. Adds the `com.apple.developer.push-to-talk` entitlement.
 *
 * File content is embedded directly here so EAS Build always has it,
 * regardless of .gitignore patterns that might exclude src/native/ios/.
 *
 * Requires Apple entitlement approval before submission:
 *   https://developer.apple.com/contact/request/
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
} = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const PTT_GROUP = 'PushToTalkModule';

// ─── Embedded native file contents ───────────────────────────────────────────
// Keep in sync with src/native/ios/PushToTalkModule.swift
const SWIFT_CONTENT = `import Foundation
import React

// PushToTalk.framework is weak-linked (iOS 16+). On iPhoneOS26.0.sdk, Apple
// removed the Swift type definitions while leaving the binary present, so
// canImport(PushToTalk) evaluates true but all PTT* types are absent.
// Neither canImport nor hasSymbol (unsupported in the iOS 26 toolchain) can
// guard against this at compile time. This module is therefore a compile-safe
// stub; the app falls back to LiveKit-based PTT when native PTT is unavailable.

@objc(PushToTalkModule)
class PushToTalkModule: RCTEventEmitter {

  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool { return false }

  override func supportedEvents() -> [String] {
    return [
      "onPTTChannelJoined",
      "onPTTChannelLeft",
      "onPTTTransmitStart",
      "onPTTTransmitStop",
      "onPTTReceiveStart",
      "onPTTReceiveStop",
      "onPTTPushToken",
      "onPTTError",
    ]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  @objc func initialize(_ channelId: String,
                        channelName: String,
                        resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter("UNSUPPORTED", "Push To Talk native framework not available on this platform", nil)
  }

  @objc func startTransmitting(_ channelId: String,
                                resolver: @escaping RCTPromiseResolveBlock,
                                rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter("UNSUPPORTED", "Push To Talk native framework not available on this platform", nil)
  }

  @objc func stopTransmitting(_ channelId: String,
                               resolver: @escaping RCTPromiseResolveBlock,
                               rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter("UNSUPPORTED", "Push To Talk native framework not available on this platform", nil)
  }

  @objc func leaveChannel(_ channelId: String,
                           resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter("UNSUPPORTED", "Push To Talk native framework not available on this platform", nil)
  }
}
`;

// Keep in sync with src/native/ios/PushToTalkModule.m
const OBJC_BRIDGE_CONTENT = `#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// RCT_EXTERN_MODULE / RCT_EXTERN_METHOD rely on RCTRegisterModule, which is
// compiled out when the New Architecture is enabled. Guard accordingly so this
// file is a no-op in New Arch builds (the Swift @objc class self-registers).
#if !RCT_NEW_ARCH_ENABLED
RCT_EXTERN_MODULE(PushToTalkModule, RCTEventEmitter)

RCT_EXTERN_METHOD(initialize:(NSString *)channelId
                  channelName:(NSString *)channelName
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(startTransmitting:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(stopTransmitting:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(leaveChannel:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)
#endif
`;

const SOURCES = [
  { name: 'PushToTalkModule.swift', content: SWIFT_CONTENT },
  { name: 'PushToTalkModule.m',     content: OBJC_BRIDGE_CONTENT },
];

// ─── 1. Entitlement ──────────────────────────────────────────────────────────
const addEntitlement = (config) =>
  withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.push-to-talk'] = true;
    return mod;
  });

// ─── 2. Background mode ──────────────────────────────────────────────────────
const addBackgroundMode = (config) =>
  withInfoPlist(config, (mod) => {
    const modes = mod.modResults.UIBackgroundModes ?? [];
    if (!modes.includes('push-to-talk')) {
      mod.modResults.UIBackgroundModes = [...modes, 'push-to-talk'];
    }
    return mod;
  });

// ─── 3. Xcode project — write files + register in pbxproj + add framework ────
const addNativeFiles = (config) =>
  withXcodeProject(config, (mod) => {
    const { platformProjectRoot, projectName } = mod.modRequest;
    const xcodeProject = mod.modResults;

    // Write files to ios/<AppName>/PushToTalkModule/
    const destDir = path.join(platformProjectRoot, projectName, PTT_GROUP);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    for (const { name, content } of SOURCES) {
      fs.writeFileSync(path.join(destDir, name), content, 'utf8');
    }

    const targetUUID = xcodeProject.getFirstTarget().uuid;

    // ── Create PushToTalkModule PBX group ──────────────────────────────────
    // Use a fully-qualified path relative to ios/ (SRCROOT) so Xcode always
    // resolves the file at ios/GatherSafe/PushToTalkModule/<file>.
    //
    // The previous approach walked mainGroup's children to find the GatherSafe
    // group and then attached the PTT group as a child (path "PushToTalkModule",
    // resolved relative to GatherSafe). When that lookup failed it fell back to
    // mainGroup, producing ios/PushToTalkModule/<file> — missing the app-name
    // component — which caused "Build input file cannot be found" at archive time.
    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    const mainGroup    = xcodeProject.getPBXGroupByKey(mainGroupKey);

    const { uuid: pttGroupUUID } = xcodeProject.addPbxGroup(
      [],
      PTT_GROUP,
      `${projectName}/${PTT_GROUP}`
    );

    if (mainGroup && !mainGroup.children.find((c) => c.comment === PTT_GROUP)) {
      mainGroup.children.push({ value: pttGroupUUID, comment: PTT_GROUP });
    }

    // Register each source file inside the PushToTalkModule group.
    // Path is just the filename — resolved relative to the group chain above.
    // Providing the group UUID bypasses addPluginFile's auto-detect (which
    // crashes when the group isn't found yet).
    for (const { name } of SOURCES) {
      xcodeProject.addSourceFile(name, { target: targetUUID }, pttGroupUUID);
    }

    // ── Weak-link PushToTalk.framework (iOS 16+ only, app runs on 15+) ──────
    const existingFrameworks = Object.values(
      xcodeProject.pbxFrameworksBuildPhaseObj(targetUUID)?.files ?? {}
    );
    const alreadyAdded = existingFrameworks.some(
      (f) => typeof f === 'object' && f?.comment?.includes('PushToTalk')
    );
    if (!alreadyAdded) {
      xcodeProject.addFramework('PushToTalk.framework', {
        weak:   true,
        target: targetUUID,
      });
    }

    return mod;
  });

// ─── Compose ─────────────────────────────────────────────────────────────────
const withPushToTalk = (config) => {
  config = addEntitlement(config);
  config = addBackgroundMode(config);
  config = addNativeFiles(config);
  return config;
};

module.exports = withPushToTalk;
