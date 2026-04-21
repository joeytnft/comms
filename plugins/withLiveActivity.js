/**
 * Expo config plugin — iOS Live Activities (Dynamic Island / Lock Screen pill).
 *
 * What this does during `expo prebuild` / EAS Build:
 *
 *  Main app target
 *  ───────────────
 *  1. Adds NSSupportsLiveActivities + NSSupportsLiveActivitiesFrequentUpdates
 *     to the main app's Info.plist. That is the only entitlement needed —
 *     there is no "Live Activities" capability in Xcode; the plist key is enough.
 *  2. Writes LiveActivityModule.m, LiveActivityModule.swift, and
 *     GatherSafeActivityAttributes.swift into ios/<AppName>/LiveActivity/
 *     and registers them in the main target's build phases.
 *  3. Patches the auto-generated <AppName>-Bridging-Header.h so the Swift
 *     module can see React Native's ObjC headers (needed for RCT_EXTERN_MODULE).
 *
 *  GatherSafeWidget extension target
 *  ──────────────────────────────────
 *  4. Creates the GatherSafeWidget Xcode target (WidgetKit extension type).
 *  5. Writes GatherSafeActivityAttributes.swift, GatherSafeLiveActivity.swift,
 *     GatherSafeLiveActivityBundle.swift, and Info.plist into
 *     ios/GatherSafeWidget/ and registers them with the widget target.
 *  6. Adds the "Embed App Extensions" build phase to the main target so the
 *     widget .appex is packaged inside the main .ipa.
 *  7. Weak-links ActivityKit.framework to both targets.
 *
 * Requires iOS 16.2+ for Live Activities; the app still runs on older devices,
 * the activity just silently never starts (the JS service guards on isAvailable).
 */

const {
  withXcodeProject,
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

@available(iOS 16.2, *)
private func micColor(state: GatherSafeActivityAttributes.ContentState) -> Color {
    if state.isTransmitting     { return .gsSuccess }
    if state.speakerName != nil { return .gsAccent  }
    return Color(.systemGray3)
}

@available(iOS 16.2, *)
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
                    .foregroundStyle(micColor(state: state))
                    .font(.system(size: 20, weight: .semibold))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(attributes.orgName).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                Text(state.channelName).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(1)
                Text(speakerText).font(.caption).foregroundStyle(micColor(state: state)).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                HStack(spacing: 3) {
                    Image(systemName: "person.2.fill").font(.caption2)
                    Text("\\(state.memberCount)").font(.caption2.monospacedDigit())
                }.foregroundStyle(.secondary)
                if let level = state.alertLevel, !level.isEmpty {
                    Text(alertLabel(level))
                        .font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
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
                        .foregroundStyle(micColor(state: context.state))
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
                    .foregroundStyle(micColor(state: context.state))
                    .font(.system(size: 14, weight: .semibold))
            } compactTrailing: {
                Text(context.state.channelName).font(.caption2.weight(.semibold)).lineLimit(1)
            } minimal: {
                Image(systemName: "mic.fill").foregroundStyle(micColor(state: context.state))
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


// ─── 2 & 3. Xcode project manipulation ───────────────────────────────────────
const addXcodeTargets = (config) =>
  withXcodeProject(config, (mod) => {
    const { platformProjectRoot, projectName } = mod.modRequest;
    const xcodeProject  = mod.modResults;
    const bundleId      = config.ios?.bundleIdentifier ?? 'com.gathersafe2.www';
    const widgetBundleId = `${bundleId}.${WIDGET_NAME}`;
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

      // Add build settings for Swift + WidgetKit.
      // pbxXCConfigurationListSection() does not exist in the xcode npm package —
      // read XCConfigurationList objects directly from the project hash instead.
      const buildConfigs    = xcodeProject.pbxXCBuildConfigurationSection();
      const configLists     = xcodeProject.hash.project.objects['XCConfigurationList'] ?? {};
      const widgetTargetObj = xcodeProject.pbxNativeTargetSection()[widgetTargetUUID];
      const widgetCfgKeys   = new Set(
        (configLists[widgetTargetObj?.buildConfigurationList]?.buildConfigurations ?? [])
          .map((c) => c.value)
      );

      // Inherit signing from the main target so EAS managed credentials apply.
      // Without DEVELOPMENT_TEAM / CODE_SIGN_STYLE on the widget, xcodebuild
      // archive fails because the extension has nothing to sign with.
      const mainTargetObj = xcodeProject.pbxNativeTargetSection()[mainTargetUUID];
      const mainCfgKeys   = new Set(
        (configLists[mainTargetObj?.buildConfigurationList]?.buildConfigurations ?? [])
          .map((c) => c.value)
      );
      let developmentTeam = null;
      let codeSignStyle   = 'Automatic';
      Object.keys(buildConfigs).forEach((key) => {
        if (!mainCfgKeys.has(key)) return;
        const cfg = buildConfigs[key];
        if (typeof cfg !== 'object' || !cfg.buildSettings) return;
        if (cfg.buildSettings.DEVELOPMENT_TEAM)  developmentTeam = cfg.buildSettings.DEVELOPMENT_TEAM;
        if (cfg.buildSettings.CODE_SIGN_STYLE)   codeSignStyle   = cfg.buildSettings.CODE_SIGN_STYLE;
      });

      Object.keys(buildConfigs).forEach((key) => {
        const cfg = buildConfigs[key];
        if (typeof cfg === 'object' && cfg.buildSettings && widgetCfgKeys.has(key)) {
          cfg.buildSettings['SWIFT_VERSION']              = '5.0';
          cfg.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2';
          cfg.buildSettings['TARGETED_DEVICE_FAMILY']     = '"1,2"';
          cfg.buildSettings['ARCHS']                      = 'arm64';
          cfg.buildSettings['ENABLE_BITCODE']             = 'NO';
          cfg.buildSettings['SKIP_INSTALL']               = 'YES';
          cfg.buildSettings['INFOPLIST_FILE']             = `${WIDGET_NAME}/Info.plist`;
          cfg.buildSettings['MARKETING_VERSION']          = config.version ?? '0.1.0';
          cfg.buildSettings['CURRENT_PROJECT_VERSION']    = String(config.ios?.buildNumber ?? config.android?.versionCode ?? '1');
          cfg.buildSettings['PRODUCT_BUNDLE_IDENTIFIER']  = widgetBundleId;
          cfg.buildSettings['PRODUCT_NAME']               = `"${WIDGET_NAME}"`;
          cfg.buildSettings['CODE_SIGN_STYLE']            = codeSignStyle;
          cfg.buildSettings['CODE_SIGN_IDENTITY']         = '"Apple Distribution"';
          if (developmentTeam) cfg.buildSettings['DEVELOPMENT_TEAM'] = developmentTeam;
          // Widget has no bridging header — explicitly clear to avoid inheriting
          // the main target's bridging header path via xcconfig.
          cfg.buildSettings['SWIFT_OBJC_BRIDGING_HEADER'] = '""';
          cfg.buildSettings['LD_RUNPATH_SEARCH_PATHS']    = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
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

      // addSourceFile() ignores the { target } option in some versions of the
      // xcode npm package and falls back to the first (main app) target's Sources
      // phase. In Expo SDK 53+ the generated AppDelegate.swift is annotated with
      // @main/@UIApplicationMain, so compiling GatherSafeLiveActivityBundle.swift
      // (also @main) in the same module produces "'main' attribute can only apply
      // to one type in a module".
      // Purge ONLY the widget-exclusive files from the main target's Sources.
      // GatherSafeActivityAttributes.swift is intentionally in BOTH targets and
      // must not be removed from main (LiveActivityModule.swift depends on it).
      const widgetOnlyNames  = new Set([
        'GatherSafeLiveActivity.swift',
        'GatherSafeLiveActivityBundle.swift',
      ]);
      const allBuildFiles    = xcodeProject.pbxBuildFileSection();
      const mainSourcesPhase = xcodeProject.pbxSourcesBuildPhaseObj(mainTargetUUID);
      if (mainSourcesPhase?.files) {
        mainSourcesPhase.files = mainSourcesPhase.files.filter((f) => {
          const name = (allBuildFiles[`${f.value}_comment`] ?? '').replace(/ in Sources$/, '');
          return !widgetOnlyNames.has(name);
        });
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

// ─── 3. Patch bridging header so Swift sees RCT ObjC headers ─────────────────
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

// ─── 4. Disable resource-bundle code signing (Xcode 14+ CocoaPods fix) ─────────
// Xcode 14+ signs resource bundle targets by default. CocoaPods-generated
// bundle targets have no team set, causing archive failure. Setting
// CODE_SIGNING_ALLOWED=NO in post_install is the standard community fix.
//
// In Expo SDK 54 / RN 0.81, the Podfile nests post_install inside a target
// block, so the file ends with TWO `end`s — an indented one closing
// post_install and an unindented one closing the target. We need the indented
// one; matching `\n\s+end` non-greedily after `post_install do |installer|`
// targets it specifically.
const patchPodfileCodesigning = (config) =>
  withDangerousMod(config, [
    'ios',
    async (mod) => {
      const podfilePath = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return mod;

      let podfile = fs.readFileSync(podfilePath, 'utf8');
      if (podfile.includes('CODE_SIGNING_ALLOWED')) return mod;

      const snippet = [
        '',
        '    # Disable code signing for CocoaPods resource bundle targets (Xcode 14+)',
        "    installer.pods_project.targets.each do |target|",
        "      if target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.bundle'",
        "        target.build_configurations.each do |config|",
        "          config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'",
        "        end",
        "      end",
        "    end",
      ].join('\n');

      // Insert before the post_install block's closing `end` (which is indented
      // because post_install is nested inside a target block).
      const match = podfile.match(/(post_install do \|installer\|[\s\S]*?)(\n[ \t]+end)/);
      if (match && match.index !== undefined) {
        const insertAt = match.index + match[1].length;
        podfile = podfile.slice(0, insertAt) + snippet + podfile.slice(insertAt);
        fs.writeFileSync(podfilePath, podfile, 'utf8');
      }
      return mod;
    },
  ]);

// ─── 5. Fix widget build phases ───────────────────────────────────────────────
// addSourceFile() with a specific target UUID can place files in the main app's
// Sources phase instead of the widget's due to a bug in the xcode npm package.
//
// This step uses PBX group membership (not filename matching) to identify widget
// source files. That correctly handles GatherSafeActivityAttributes.swift, which
// exists in both the widget group (GatherSafeWidget/) and the main LiveActivity
// group (GatherSafe/LiveActivity/). Filename matching would miss the widget copy;
// group-based matching routes each copy to the right target:
//   • GatherSafeWidget group copy  → widget Sources
//   • LiveActivity group copy      → main Sources (untouched)
//
// Without GatherSafeActivityAttributes.swift in the widget's Sources phase, the
// widget Swift compilation silently fails and produces no executable, causing
// App Store error 90085 ("No architectures in the binary").
const fixWidgetBuildPhases = (config) =>
  withXcodeProject(config, (mod) => {
    const proj    = mod.modResults;
    const objects = proj.hash.project.objects;

    // ── Locate targets ──────────────────────────────────────────────────────
    const nativeTargets = objects['PBXNativeTarget'] ?? {};
    const mainTargetUUID = proj.getFirstTarget().uuid;
    let widgetTargetUUID = null;
    for (const [uuid, t] of Object.entries(nativeTargets)) {
      if (typeof t !== 'object') continue;
      const name = (t.name ?? '').replace(/^"|"$/g, '');
      if (name === WIDGET_NAME) { widgetTargetUUID = uuid; break; }
    }
    if (!widgetTargetUUID) return mod; // widget not created yet — nothing to fix

    const mainTarget   = nativeTargets[mainTargetUUID];
    const widgetTarget = nativeTargets[widgetTargetUUID];

    // ── Find Sources build phase UUIDs for each target ──────────────────────
    const allSourcePhases = objects['PBXSourcesBuildPhase'] ?? {};
    const phaseUUIDOf = (target) =>
      (target.buildPhases ?? []).map((p) => p.value).find((u) => allSourcePhases[u]);

    const mainSourcesUUID   = phaseUUIDOf(mainTarget);
    let   widgetSourcesUUID = phaseUUIDOf(widgetTarget);

    // ── Collect file ref UUIDs that belong to the widget's PBX group ────────
    // Identify by group membership so shared filenames across groups are handled
    // correctly — only refs that are children of the GatherSafeWidget group are
    // considered widget files.
    const pbxGroups = objects['PBXGroup'] ?? {};
    const widgetChildFileRefs = new Set();
    for (const [uuid, group] of Object.entries(pbxGroups)) {
      if (uuid.endsWith('_comment') || typeof group !== 'object') continue;
      const groupPath = (group.path ?? group.name ?? '').replace(/^"|"$/g, '');
      if (groupPath !== WIDGET_NAME) continue;
      for (const child of (group.children ?? [])) {
        widgetChildFileRefs.add(child.value);
      }
    }

    const buildFiles = objects['PBXBuildFile'] ?? {};

    // Map fileRefUUID → [{ value: buildFileUUID, comment }]
    // addSourceFile() may produce multiple PBXBuildFile entries for the same
    // file ref; deduplication by fileRef UUID avoids compiling a file twice.
    const buildFilesByFileRef = new Map();
    for (const [key, bf] of Object.entries(buildFiles)) {
      if (key.endsWith('_comment') || typeof bf !== 'object') continue;
      const fileRef = (bf.fileRef ?? '').replace(/^"|"$/g, '');
      if (!widgetChildFileRefs.has(fileRef)) continue;
      const arr = buildFilesByFileRef.get(fileRef) ?? [];
      arr.push({ value: key, comment: buildFiles[`${key}_comment`] ?? '' });
      buildFilesByFileRef.set(fileRef, arr);
    }

    const allWidgetBuildFileUUIDs = new Set(
      [...buildFilesByFileRef.values()].flat().map((e) => e.value)
    );

    // ── Remove ALL widget-group build file entries from main's Sources ────────
    if (mainSourcesUUID) {
      const phase = allSourcePhases[mainSourcesUUID];
      if (phase?.files) {
        phase.files = phase.files.filter(
          (f) => typeof f !== 'object' || !allWidgetBuildFileUUIDs.has(f.value)
        );
      }
    }

    // ── Create widget Sources phase if it doesn't exist ─────────────────────
    if (!widgetSourcesUUID) {
      widgetSourcesUUID = proj.generateUuid();
      allSourcePhases[widgetSourcesUUID] = {
        isa: 'PBXSourcesBuildPhase',
        buildActionMask: 2147483647,
        files: [],
        runOnlyForDeploymentPostprocessing: 0,
      };
      widgetTarget.buildPhases = widgetTarget.buildPhases ?? [];
      widgetTarget.buildPhases.push({ value: widgetSourcesUUID, comment: 'Sources' });
    }

    // ── Ensure exactly ONE entry per widget file in widget's Sources ─────────
    const widgetPhase = allSourcePhases[widgetSourcesUUID];
    const seenFileRefs = new Set();
    widgetPhase.files = (widgetPhase.files ?? []).filter((f) => {
      if (typeof f !== 'object') return true;
      const bf      = buildFiles[f.value];
      const fileRef = bf ? (bf.fileRef ?? '').replace(/^"|"$/g, '') : null;
      if (!fileRef || !widgetChildFileRefs.has(fileRef)) return true; // keep non-widget files
      if (seenFileRefs.has(fileRef)) return false; // drop duplicate
      seenFileRefs.add(fileRef);
      return true;
    });

    for (const [fileRef, entries] of buildFilesByFileRef) {
      if (!seenFileRefs.has(fileRef)) {
        widgetPhase.files.push(entries[0]);
        seenFileRefs.add(fileRef);
      }
    }

    return mod;
  });

// ─── Compose ──────────────────────────────────────────────────────────────────
const withLiveActivity = (config) => {
  config = addInfoPlistKeys(config);
  config = addXcodeTargets(config);
  config = fixWidgetBuildPhases(config);
  config = patchBridgingHeader(config);
  config = patchPodfileCodesigning(config);
  return config;
};

module.exports = withLiveActivity;
