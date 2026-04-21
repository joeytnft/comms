const { withEntitlementsPlist } = require('@expo/config-plugins');

const withCriticalAlerts = (config) =>
  withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.usernotifications.critical-alerts'] = true;
    return mod;
  });

module.exports = withCriticalAlerts;
