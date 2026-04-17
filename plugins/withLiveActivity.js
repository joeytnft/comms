/**
 * Expo config plugin — iOS Live Activities (Dynamic Island / Lock Screen pill).
 *
 * What this does during `expo prebuild` / EAS Build:
 *
 *  Main app target
 *  ───────────────
 *  1. Adds NSSupportsLiveActivities + NSSupportsLiveActivitiesFrequentUpdates
 *     to the main app's Info.plist.
 *  2. Adds the App Group entitlement (group.<bundleId>.liveactivity) to the
 *     main app — required for the widget extension to read shared data.
 *  3. Writes LiveActivityModule.m, LiveActivityModule.swift, and
 *     GatherSafeActivityAttributes.swift into ios/<AppName>/LiveActivity/
 *     and registers them in the main target's build phases.
 *  4. Patches the auto-generated <AppName>-Bridging-Header.h so the Swift
 *     module can see React Native's ObjC headers (needed for RCT_EXTERN_MODULE).
 *
 *  GatherSafeWidget extension target
 *  ──────────────────────────────────
 *  5. Creates the GatherSafeWidget Xcode target (WidgetKit extension type).
 *  6. Writes GatherSafeActivityAttributes.swift, GatherSafeLiveActivity.swift,
 *     GatherSafeLiveActivityBundle.swift, and Info.plist into
 *     ios/GatherSafeWidget/ and registers them with the widget target.
 *  7. Adds the App Group entitlement to the widget target's .entitlements file.
 *  8. Adds the "Embed App Extensions" build phase to the main target so the
 *     widget .appex is packaged inside the main .ipa.
 *  9. Weak-links ActivityKit.framework to both targets.
 *
 * Requires iOS 16.2+ for Live Activities; the app still runs on older devices,
 * the activity just silently never starts (the JS service guards on isAvailable).
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const WIDGET_NAME       = 'GatherSafeWidget';
const LIVE_ACTIVITY_GRP = 'LiveActivity';

// ─── Embedded native file content ────────────────────────────────────────────

// Keep in sync with src/native/ios/GatherSafeActivityAttributes.swift
const ATTRS_CONTENT = `import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct GatherSafeActivityAttributes: ActivityAttributes {
    public var orgName: String

    public struct ContentState: Codable, Hashable {
        public var channelName: String
        public var speakerName: String?
        public var isTransmitting: Bool
        public var memberCount: Int
        public var alertLevel: String?
    }
}
`;

// Keep in sync with src/native/ios/LiveActivityModule.m
const MODULE_M_CONTENT = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)channelName
                  orgName:(NSString *)orgName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(NSString *)activityId
                  channelName:(NSString *)channelName
                  speakerName:(NSString *)speakerName
                  isTransmitting:(BOOL)isTransmitting
                  memberCount:(nonnull NSNumber *)memberCount
                  alertLevel:(NSString *)alertLevel
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(NSString *)activityId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`;

// Keep in sync with src/native/ios/LiveActivityModule.swift
const MODULE_SWIFT_CONTENT = `import Foundation
import ActivityKit

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func startActivity(
        _ channelName: String,
        orgName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            reject("ACTIVITIES_DISABLED", "Live Activities are disabled on this device", nil)
            return
        }
        let attrs = GatherSafeActivityAttributes(orgName: orgName)
        let state = GatherSafeActivityAttributes.ContentState(
            channelName: channelName, speakerName: nil,
            isTransmitting: false, memberCount: 0, alertLevel: nil
        )
        do {
            let activity = try Activity<GatherSafeActivityAttributes>.request(
                attributes: attrs,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            resolve(activity.id)
        } catch {
            reject("START_FAILED", error.localizedDescription, error)
        }
    }

    @objc func updateActivity(
        _ activityId: String,
        channelName: String,
        speakerName: String?,
        isTransmitting: Bool,
        memberCount: NSNumber,
        alertLevel: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }
        let newState = GatherSafeActivityAttributes.ContentState(
            channelName: channelName,
            speakerName: speakerName?.isEmpty == false ? speakerName : nil,
            isTransmitting: isTransmitting,
            memberCount: memberCount.intValue,
            alertLevel: alertLevel?.isEmpty == false ? alertLevel : nil
        )
        Task {
            for activity in Activity<GatherSafeActivityAttributes>.activities
                where activity.id == activityId {
                    await activity.update(ActivityContent(state: newState, staleDate: nil))
            }
            resolve(nil)
        }
    }

    @objc func endActivity(
        _ activityId: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }
        Task {
            for activity in Activity<GatherSafeActivityAttributes>.activities
                where activity.id == activityId {
                    await activity.end(nil, dismissalPolicy: .immediate)
            }
            resolve(nil)
        }
    }
}
`;

// Keep in sync with src/native/ios/GatherSafeWidget/GatherSafeLiveActivity.swift
const WIDGET_LIVE_ACTIVITY_CONTENT = `import ActivityKit
import SwiftUI
import WidgetKit

private extension Color {
    static let gsBackground = Color(red: 0.10, green: 0.10, blue: 0.14)
    static let gsAccent     = Color(red: 0.22, green: 0.53, blue: 0.98)
    static let gsSuccess    = Color(red: 0.18, green: 0.78, blue: 0.45)
    static let gsDanger     = Color(red: 0.95, green: 0.27, blue: 0.27)
    static let gsWarning    = Color(red: 1.00, green: 0.70, blue: 0.00)
    static let gsAttention  = Color(red: 1.00, green: 0.60, blue: 0.00)
}

private func alertColor(_ level: String?) -> Color {
    switch level {
    case "emergency": return .gsDanger
    case "warning":   return .gsWarning
    case "attention": return .gsAttention
    default:          return .clear
    }
}

private func alertLabel(_ level: String?) -> String {
    switch level {
    case "emergency": return "EMERGENCY"
    case "warning":   return "WARNING"
    case "attention": return "ATTENTION"
    default:          return ""
    }
}

private func micColor(state: GatherSafeActivityAttributes.ContentState) -> Color {
    if state.isTransmitting     { return .gsSuccess }
    if state.speakerName != nil { return .gsAccent  }
    return Color(.systemGray3)
}

struct ExpandedView: View {
    let attributes: GatherSafeActivityAttributes
    let state: GatherSafeActivityAttributes.ContentState

    private var speakerText: String {
        if state.isTransmitting         { return "You are speaking" }
        if let n = state.speakerName    { return "\\(n) is speaking" }
        return "Channel active"
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(micColor(state: state).opacity(0.18)).frame(width: 44, height: 44)
                Image(systemName: state.isTransmitting ? "mic.fill" : "mic")
                    .foregroundColor(micColor(state: state))
                    .font(.system(size: 20, weight: .semibold))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(attributes.orgName).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                Text(state.channelName).font(.subheadline.weight(.semibold)).foregroundColor(.primary).lineLimit(1)
                Text(speakerText).font(.caption).foregroundColor(micColor(state: state)).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                HStack(spacing: 3) {
                    Image(systemName: "person.2.fill").font(.caption2)
                    Text("\\(state.memberCount)").font(.caption2.monospacedDigit())
                }.foregroundColor(.secondary)
                if let level = state.alertLevel, !level.isEmpty {
                    Text(alertLabel(level))
                        .font(.system(size: 9, weight: .bold)).foregroundColor(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(alertColor(level)).clipShape(Capsule())
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
}

@available(iOS 16.2, *)
struct GatherSafeLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GatherSafeActivityAttributes.self) { context in
            ExpandedView(attributes: context.attributes, state: context.state)
                .background(Color.gsBackground)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.state.isTransmitting ? "mic.fill" : "mic")
                        .foregroundColor(micColor(state: context.state))
                        .padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.channelName).font(.caption2.weight(.semibold)).padding(.trailing, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedView(attributes: context.attributes, state: context.state)
                }
            } compactLeading: {
                Image(systemName: context.state.isTransmitting ? "mic.fill" : "mic")
                    .foregroundColor(micColor(state: context.state))
                    .font(.system(size: 14, weight: .semibold))
            } compactTrailing: {
                Text(context.state.channelName).font(.caption2.weight(.semibold)).lineLimit(1)
            } minimal: {
                Image(systemName: "mic.fill").foregroundColor(micColor(state: context.state))
                    .font(.system(size: 12, weight: .semibold))
            }
            .widgetURL(URL(string: "gathersafe://ptt"))
            .keylineTint(micColor(state: context.state))
        }
    }
}
`;

// Keep in sync with src/native/ios/GatherSafeWidget/GatherSafeLiveActivityBundle.swift
const WIDGET_BUNDLE_CONTENT = `import SwiftUI
import WidgetKit

@main
struct GatherSafeWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.2, *) {
            GatherSafeLiveActivity()
        }
    }
}
`;

const WIDGET_INFO_PLIST_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key><string>GatherSafeWidget</string>
  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key><string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`;

// ─── 1. Main app Info.plist ───────────────────────────────────────────────────
const addInfoPlistKeys = (config) =>
  withInfoPlist(config, (mod) => {
    mod.modResults['NSSupportsLiveActivities']               = true;
    mod.modResults['NSSupportsLiveActivitiesFrequentUpdates'] = true;
    return mod;
  });

// ─── 2. Main app entitlement (App Group) ─────────────────────────────────────
const addMainEntitlement = (config) =>
  withEntitlementsPlist(config, (mod) => {
    const bundleId  = config.ios?.bundleIdentifier ?? 'com.gathersafeapp.app';
    const groupId   = `group.${bundleId}.liveactivity`;
    const existing  = mod.modResults['com.apple.security.application-groups'] ?? [];
    if (!existing.includes(groupId)) {
      mod.modResults['com.apple.security.application-groups'] = [...existing, groupId];
    }
    return mod;
  });

// ─── 3 & 4. Xcode project manipulation ───────────────────────────────────────
const addXcodeTargets = (config) =>
  withXcodeProject(config, (mod) => {
    const { platformProjectRoot, projectName } = mod.modRequest;
    const xcodeProject  = mod.modResults;
    const bundleId      = config.ios?.bundleIdentifier ?? 'com.gathersafeapp.app';
    const widgetBundleId = `${bundleId}.${WIDGET_NAME}`;
    const groupId       = `group.${bundleId}.liveactivity`;
    const mainTargetUUID = xcodeProject.getFirstTarget().uuid;

    // ── Write main-app native files ─────────────────────────────────────────
    const mainDir = path.join(platformProjectRoot, projectName, LIVE_ACTIVITY_GRP);
    if (!fs.existsSync(mainDir)) fs.mkdirSync(mainDir, { recursive: true });

    const mainSources = [
      { name: 'LiveActivityModule.m',             content: MODULE_M_CONTENT         },
      { name: 'LiveActivityModule.swift',          content: MODULE_SWIFT_CONTENT     },
      { name: 'GatherSafeActivityAttributes.swift',content: ATTRS_CONTENT            },
    ];
    for (const { name, content } of mainSources) {
      fs.writeFileSync(path.join(mainDir, name), content, 'utf8');
    }

    // Register main-app sources in a PBX group
    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    const mainGroup    = xcodeProject.getPBXGroupByKey(mainGroupKey);
    const { uuid: laGroupUUID } = xcodeProject.addPbxGroup(
      [], LIVE_ACTIVITY_GRP, `${projectName}/${LIVE_ACTIVITY_GRP}`
    );
    if (mainGroup && !mainGroup.children.find((c) => c.comment === LIVE_ACTIVITY_GRP)) {
      mainGroup.children.push({ value: laGroupUUID, comment: LIVE_ACTIVITY_GRP });
    }
    for (const { name } of mainSources) {
      xcodeProject.addSourceFile(name, { target: mainTargetUUID }, laGroupUUID);
    }

    // Weak-link ActivityKit to main target
    const mainFrameworks = Object.values(
      xcodeProject.pbxFrameworksBuildPhaseObj(mainTargetUUID)?.files ?? {}
    );
    if (!mainFrameworks.some((f) => typeof f === 'object' && f?.comment?.includes('ActivityKit'))) {
      xcodeProject.addFramework('ActivityKit.framework', { weak: true, target: mainTargetUUID });
    }

    // ── Write widget extension files ────────────────────────────────────────
    const widgetDir = path.join(platformProjectRoot, WIDGET_NAME);
    if (!fs.existsSync(widgetDir)) fs.mkdirSync(widgetDir, { recursive: true });

    const widgetSources = [
      { name: 'GatherSafeActivityAttributes.swift', content: ATTRS_CONTENT                  },
      { name: 'GatherSafeLiveActivity.swift',        content: WIDGET_LIVE_ACTIVITY_CONTENT   },
      { name: 'GatherSafeLiveActivityBundle.swift',  content: WIDGET_BUNDLE_CONTENT          },
    ];
    for (const { name, content } of widgetSources) {
      fs.writeFileSync(path.join(widgetDir, name), content, 'utf8');
    }
    fs.writeFileSync(path.join(widgetDir, 'Info.plist'), WIDGET_INFO_PLIST_CONTENT, 'utf8');

    // Write widget entitlements file
    const widgetEntitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array><string>${groupId}</string></array>
</dict>
</plist>
`;
    fs.writeFileSync(path.join(widgetDir, `${WIDGET_NAME}.entitlements`), widgetEntitlements, 'utf8');

    // ── Create widget Xcode target (idempotent) ─────────────────────────────
    const existingTargets = xcodeProject.pbxNativeTargetSection();
    const widgetAlreadyExists = Object.values(existingTargets).some(
      (t) => typeof t === 'object' && t.name === `"${WIDGET_NAME}"` || t.name === WIDGET_NAME
    );

    if (!widgetAlreadyExists) {
      // addTarget(name, type, subfolder, bundleId)
      const widgetTarget = xcodeProject.addTarget(
        WIDGET_NAME,
        'app_extension',
        WIDGET_NAME,
        widgetBundleId
      );
      const widgetTargetUUID = widgetTarget.uuid;

      // Add build settings for Swift + WidgetKit
      const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
      Object.keys(buildConfigs).forEach((key) => {
        const cfg = buildConfigs[key];
        if (
          typeof cfg === 'object' &&
          cfg.buildSettings &&
          // Only patch configs that belong to the widget target (via target reference)
          xcodeProject.pbxXCConfigurationListSection()[
            xcodeProject.pbxNativeTargetSection()[widgetTargetUUID]?.buildConfigurationList
          ]?.buildConfigurations?.some((c) => c.value === key)
        ) {
          cfg.buildSettings['SWIFT_VERSION']                     = '5.0';
          cfg.buildSettings['IPHONEOS_DEPLOYMENT_TARGET']        = '16.2';
          cfg.buildSettings['TARGETED_DEVICE_FAMILY']            = '"1,2"';
          cfg.buildSettings['SKIP_INSTALL']                      = 'YES';
          cfg.buildSettings['CODE_SIGN_ENTITLEMENTS']            =
            `${WIDGET_NAME}/${WIDGET_NAME}.entitlements`;
          cfg.buildSettings['INFOPLIST_FILE']                    = `${WIDGET_NAME}/Info.plist`;
          cfg.buildSettings['MARKETING_VERSION']                 =
            config.version ?? '0.1.0';
        }
      });

      // Register widget source files in a PBX group
      const rootGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
      const rootGroup    = xcodeProject.getPBXGroupByKey(rootGroupKey);
      const { uuid: widgetGroupUUID } = xcodeProject.addPbxGroup(
        [], WIDGET_NAME, WIDGET_NAME
      );
      if (rootGroup && !rootGroup.children.find((c) => c.comment === WIDGET_NAME)) {
        rootGroup.children.push({ value: widgetGroupUUID, comment: WIDGET_NAME });
      }
      for (const { name } of widgetSources) {
        xcodeProject.addSourceFile(name, { target: widgetTargetUUID }, widgetGroupUUID);
      }

      // Weak-link WidgetKit + ActivityKit to widget target
      xcodeProject.addFramework('WidgetKit.framework',  { weak: false, target: widgetTargetUUID });
      xcodeProject.addFramework('SwiftUI.framework',    { weak: false, target: widgetTargetUUID });
      xcodeProject.addFramework('ActivityKit.framework',{ weak: true,  target: widgetTargetUUID });

      // Embed the widget extension into the main app
      xcodeProject.addTargetDependency(mainTargetUUID, [widgetTargetUUID]);
      xcodeProject.addBuildPhase(
        [],
        'PBXCopyFilesBuildPhase',
        'Embed App Extensions',
        mainTargetUUID,
        'app_extension'
      );
    }

    return mod;
  });

// ─── 4. Patch bridging header so Swift sees RCT ObjC headers ─────────────────
const patchBridgingHeader = (config) =>
  withDangerousMod(config, [
    'ios',
    async (mod) => {
      const { platformProjectRoot } = mod.modRequest;
      // Expo generates this file during prebuild
      const projectName   = mod.modRequest.projectName;
      const headerPath    = path.join(
        platformProjectRoot,
        projectName,
        `${projectName}-Bridging-Header.h`
      );

      if (!fs.existsSync(headerPath)) return mod;

      let content = fs.readFileSync(headerPath, 'utf8');
      const rctImport = '#import <React/RCTBridgeModule.h>';
      if (!content.includes(rctImport)) {
        content = `${rctImport}\n${content}`;
        fs.writeFileSync(headerPath, content, 'utf8');
      }
      return mod;
    },
  ]);

// ─── Compose ──────────────────────────────────────────────────────────────────
const withLiveActivity = (config) => {
  config = addInfoPlistKeys(config);
  config = addMainEntitlement(config);
  config = addXcodeTargets(config);
  config = patchBridgingHeader(config);
  return config;
};

module.exports = withLiveActivity;
