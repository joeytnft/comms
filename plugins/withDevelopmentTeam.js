const { withXcodeProject } = require('@expo/config-plugins');

module.exports = function withDevelopmentTeam(config, { developmentTeam }) {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const buildConfig = configurations[key];
      if (buildConfig && buildConfig.buildSettings) {
        buildConfig.buildSettings.DEVELOPMENT_TEAM = developmentTeam;
        if (buildConfig.buildSettings.PRODUCT_NAME !== undefined) {
          buildConfig.buildSettings.ARCHS = 'arm64';
        }
      }
    }
    return mod;
  });
};
