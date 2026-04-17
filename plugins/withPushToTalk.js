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

// Conditionally import PushToTalk. In iOS 26+ the framework module was
// restructured and PTTChannelManager / PTTChannelManagerDelegate were
// removed, so we guard every usage with #if hasSymbol(PTTChannelManager).
// The app falls back to its LiveKit-only PTT path on those platforms.
#if canImport(PushToTalk)
import PushToTalk
#endif

// iOS 16+ PTT delegate — kept in a separate class so the RN module itself
// remains loadable on iOS 15 (framework is weak-linked).
#if canImport(PushToTalk) && hasSymbol(PTTChannelManager)
@available(iOS 16.0, *)
private class PTTChannelHandler: NSObject, PTTChannelManagerDelegate {
  weak var emitter: PushToTalkModule?
  var channelManager: PTTChannelManager?

  init(emitter: PushToTalkModule) {
    self.emitter = emitter
  }

  // MARK: - PTTChannelManagerDelegate

  func channelManager(_ channelManager: PTTChannelManager,
                      didJoinChannel channelId: String,
                      with reason: PTTChannelJoinReason) {
    emitter?.sendEvent(withName: "onPTTChannelJoined", body: ["channelId": channelId])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      didLeaveChannel channelId: String,
                      with reason: PTTChannelLeaveReason) {
    emitter?.sendEvent(withName: "onPTTChannelLeft", body: ["channelId": channelId])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      channelId: String,
                      didBeginTransmittingFrom source: PTTTransmitRequestSource) {
    emitter?.sendEvent(withName: "onPTTTransmitStart", body: ["channelId": channelId])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      channelId: String,
                      didEndTransmittingFrom source: PTTTransmitRequestSource) {
    emitter?.sendEvent(withName: "onPTTTransmitStop", body: ["channelId": channelId])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      channelId: String,
                      receivedEphemeralPushToken pushToken: Data) {
    let tokenHex = pushToken.map { String(format: "%02x", $0) }.joined()
    emitter?.sendEvent(withName: "onPTTPushToken", body: [
      "channelId": channelId,
      "token": tokenHex
    ])
  }

  func incomingPushResult(channelManager: PTTChannelManager,
                          channelId: String,
                          pushPayload: [String: Any]) -> PTTPushResult {
    guard let senderName = pushPayload["senderName"] as? String else {
      return .leaveChannel
    }
    let participant = PTTActiveRemoteParticipant(name: senderName, image: nil)
    return .activeRemoteParticipant(participant)
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      channelId: String,
                      activeRemoteParticipantDidChange participant: PTTActiveRemoteParticipant?) {
    if let participant = participant {
      emitter?.sendEvent(withName: "onPTTReceiveStart", body: [
        "channelId": channelId,
        "participantName": participant.name as Any
      ])
    } else {
      emitter?.sendEvent(withName: "onPTTReceiveStop", body: ["channelId": channelId])
    }
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      failedToJoinChannel channelId: String,
                      error: Error) {
    emitter?.sendEvent(withName: "onPTTError", body: [
      "channelId": channelId,
      "error": error.localizedDescription
    ])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      failedToLeaveChannel channelId: String,
                      error: Error) {
    emitter?.sendEvent(withName: "onPTTError", body: [
      "channelId": channelId,
      "error": error.localizedDescription
    ])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      failedToBeginTransmittingInChannel channelId: String,
                      error: Error) {
    emitter?.sendEvent(withName: "onPTTError", body: [
      "channelId": channelId,
      "error": error.localizedDescription
    ])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      failedToStopTransmittingInChannel channelId: String,
                      error: Error) {
    emitter?.sendEvent(withName: "onPTTError", body: [
      "channelId": channelId,
      "error": error.localizedDescription
    ])
  }
}
#endif // canImport(PushToTalk) && hasSymbol(PTTChannelManager)

// MARK: - React Native Module

@objc(PushToTalkModule)
class PushToTalkModule: RCTEventEmitter {

  private var pttHandler: AnyObject?
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

  // MARK: - JS-facing Methods

  @objc func initialize(_ channelId: String,
                        channelName: String,
                        resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
#if canImport(PushToTalk) && hasSymbol(PTTChannelManager)
    guard #available(iOS 16.0, *) else {
      rejecter("UNSUPPORTED", "Push To Talk requires iOS 16 or later", nil)
      return
    }
    let handler = PTTChannelHandler(emitter: self)
    self.pttHandler = handler
    Task {
      do {
        let manager = try await PTTChannelManager.channelManager(
          delegate: handler,
          restorationDelegate: nil
        )
        handler.channelManager = manager
        let descriptor = PTTChannelDescriptor(name: channelName, image: nil)
        // iOS 17 deprecated the token/serviceType overload; use the simpler API when available.
        if #available(iOS 17.0, *) {
          try await manager.joinChannel(channelId: channelId, descriptor: descriptor)
        } else {
          try await manager.joinChannel(
            channelId: channelId,
            descriptor: descriptor,
            token: nil,
            serviceType: .channelService
          )
        }
        resolver(nil)
      } catch {
        rejecter("PTT_INIT_ERROR", error.localizedDescription, error)
      }
    }
#else
    rejecter("UNSUPPORTED", "Push To Talk framework not available on this platform", nil)
#endif
  }

  @objc func startTransmitting(_ channelId: String,
                                resolver: @escaping RCTPromiseResolveBlock,
                                rejecter: @escaping RCTPromiseRejectBlock) {
#if canImport(PushToTalk) && hasSymbol(PTTChannelManager)
    guard #available(iOS 16.0, *),
          let handler = pttHandler as? PTTChannelHandler,
          let manager = handler.channelManager else {
      rejecter("PTT_NOT_INITIALIZED", "PTT channel not initialized", nil)
      return
    }
    Task {
      do {
        try await manager.requestBeginTransmitting(channelId: channelId)
        resolver(nil)
      } catch {
        rejecter("PTT_TRANSMIT_ERROR", error.localizedDescription, error)
      }
    }
#else
    rejecter("UNSUPPORTED", "Push To Talk framework not available on this platform", nil)
#endif
  }

  @objc func stopTransmitting(_ channelId: String,
                               resolver: @escaping RCTPromiseResolveBlock,
                               rejecter: @escaping RCTPromiseRejectBlock) {
#if canImport(PushToTalk) && hasSymbol(PTTChannelManager)
    guard #available(iOS 16.0, *),
          let handler = pttHandler as? PTTChannelHandler,
          let manager = handler.channelManager else {
      rejecter("PTT_NOT_INITIALIZED", "PTT channel not initialized", nil)
      return
    }
    Task {
      do {
        try await manager.stopTransmitting(channelId: channelId)
        resolver(nil)
      } catch {
        rejecter("PTT_STOP_ERROR", error.localizedDescription, error)
      }
    }
#else
    rejecter("UNSUPPORTED", "Push To Talk framework not available on this platform", nil)
#endif
  }

  @objc func leaveChannel(_ channelId: String,
                           resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
#if canImport(PushToTalk) && hasSymbol(PTTChannelManager)
    guard #available(iOS 16.0, *),
          let handler = pttHandler as? PTTChannelHandler,
          let manager = handler.channelManager else {
      rejecter("PTT_NOT_INITIALIZED", "PTT channel not initialized", nil)
      return
    }
    Task {
      do {
        try await manager.leaveChannel(channelId: channelId)
        self.pttHandler = nil
        resolver(nil)
      } catch {
        rejecter("PTT_LEAVE_ERROR", error.localizedDescription, error)
      }
    }
#else
    rejecter("UNSUPPORTED", "Push To Talk framework not available on this platform", nil)
#endif
  }
}
`;

// Keep in sync with src/native/ios/PushToTalkModule.m
const OBJC_BRIDGE_CONTENT = `#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

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
