/**
 * Expo config plugin — Apple Push To Talk framework integration.
 *
 * What this does during `expo prebuild` / EAS Build:
 *  1. Copies src/native/ios/PushToTalkModule.m into the Xcode project directory.
 *  2. Registers it in the .pbxproj under a PushToTalkModule group.
 *  3. Adds PushToTalk.framework (weak-linked for iOS <16 safety).
 *  4. Sets the `push-to-talk` UIBackgroundMode.
 *  5. Adds the `com.apple.developer.push-to-talk` entitlement.
 *
 * Why ObjC instead of Swift:
 *   iPhoneOS26.0.sdk removed the Swift module overlay for PushToTalk.framework
 *   while keeping the ObjC headers. Swift's canImport() returned true (binary
 *   present) but all PTT* types were missing. ObjC uses __has_include() to check
 *   for the actual header file, bypassing the Swift overlay entirely.
 *
 * The native source is read from src/native/ios/PushToTalkModule.m at build
 * time — there is a SINGLE source of truth. Previously this plugin embedded
 * a stale copy of the ObjC file as a string literal, which silently diverged
 * from the checked-in version and shipped old, buggy code to TestFlight.
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

// Read the native source from src/native/ios at build time — single source of truth.
const SOURCE_FILES = [
  {
    name: 'PushToTalkModule.m',
    srcPath: path.join('src', 'native', 'ios', 'PushToTalkModule.m'),
  },
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
    const { platformProjectRoot, projectName, projectRoot } = mod.modRequest;
    const xcodeProject = mod.modResults;

    // Write files to ios/<AppName>/PushToTalkModule/
    const destDir = path.join(platformProjectRoot, projectName, PTT_GROUP);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    for (const { name, srcPath } of SOURCE_FILES) {
      const absSrc = path.join(projectRoot, srcPath);
      if (!fs.existsSync(absSrc)) {
        throw new Error(
          `withPushToTalk: source file not found at ${absSrc}. ` +
            `Ensure ${srcPath} is checked into the repo.`
        );
      }
      const content = fs.readFileSync(absSrc, 'utf8');
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
    for (const { name } of SOURCE_FILES) {
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
