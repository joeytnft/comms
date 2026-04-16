/**
 * Expo config plugin — Apple Push To Talk framework integration.
 *
 * What this does during `expo prebuild` / EAS Build:
 *  1. Copies the Swift + ObjC bridge files into the Xcode project.
 *  2. Adds PushToTalk.framework (weak-linked for iOS <16 safety).
 *  3. Sets the `push-to-talk` UIBackgroundMode.
 *  4. Adds the `com.apple.developer.push-to-talk` entitlement.
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
const SOURCES   = ['PushToTalkModule.swift', 'PushToTalkModule.m'];

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

// ─── 3. Xcode project — copy files + add framework ───────────────────────────
const addNativeFiles = (config) =>
  withXcodeProject(config, (mod) => {
    const { projectRoot, platformProjectRoot, projectName } = mod.modRequest;
    const xcodeProject = mod.modResults;

    // Source files live in src/native/ios/
    const sourceDir = path.join(projectRoot, 'src', 'native', 'ios');
    // Destination inside the generated ios/<AppName>/ directory
    const destDir   = path.join(platformProjectRoot, projectName, PTT_GROUP);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    SOURCES.forEach((file) => {
      const src  = path.join(sourceDir, file);
      const dest = path.join(destDir,   file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      } else {
        console.warn(`[withPushToTalk] Source file not found: ${src}`);
      }
    });

    // ── Add a PBX group for the module files ──
    const relPaths = SOURCES.map((f) => path.join(projectName, PTT_GROUP, f));
    const pttGroup = xcodeProject.addPbxGroup([], PTT_GROUP, PTT_GROUP);

    // Attach the new group to the root "main group"
    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    const mainGroup    = xcodeProject.getPBXGroupByKey(mainGroupKey);
    if (mainGroup && !mainGroup.children.find((c) => c.comment === PTT_GROUP)) {
      mainGroup.children.push({ value: pttGroup.uuid, comment: PTT_GROUP });
    }

    // Add each file as a source build file for the first (app) target
    const targetUUID = xcodeProject.getFirstTarget().uuid;
    relPaths.forEach((relPath) => {
      // addSourceFile registers the file AND adds it to the PBXSourcesBuildPhase
      xcodeProject.addSourceFile(relPath, { target: targetUUID }, pttGroup.uuid);
    });

    // ── Weak-link PushToTalk.framework (iOS 16+ only, app runs on 15+) ──
    const existingFrameworks = Object.values(xcodeProject.pbxFrameworksBuildPhaseObj(targetUUID)?.files ?? {});
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
