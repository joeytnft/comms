/**
 * Expo config plugin — Podfile fixes that aren't tied to any one feature.
 *
 * Currently does:
 *  - Disable code signing on CocoaPods-generated resource bundle targets.
 *    Xcode 14+ tries to sign them by default; CocoaPods bundles have no
 *    DEVELOPMENT_TEAM set, which breaks `xcodebuild archive`. Setting
 *    CODE_SIGNING_ALLOWED=NO in post_install is the standard community fix.
 *
 * This was previously bundled inside withLiveActivity.js. Extracting it lets
 * us toggle Live Activities off without breaking release builds. If we ever
 * re-enable the LA plugin, this stays in place; the patch is idempotent
 * (early-returns if it sees CODE_SIGNING_ALLOWED already in the Podfile).
 */

const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

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
      // because post_install is nested inside a target block in Expo SDK 54+).
      const match = podfile.match(/(post_install do \|installer\|[\s\S]*?)(\n[ \t]+end)/);
      if (match && match.index !== undefined) {
        const insertAt = match.index + match[1].length;
        podfile = podfile.slice(0, insertAt) + snippet + podfile.slice(insertAt);
        fs.writeFileSync(podfilePath, podfile, 'utf8');
      }
      return mod;
    },
  ]);

module.exports = (config) => patchPodfileCodesigning(config);
