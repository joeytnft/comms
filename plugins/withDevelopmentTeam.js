const { withXcodeProject } = require('@expo/config-plugins');

module.exports = function withDevelopmentTeam(config, { developmentTeam }) {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const config = configurations[key];
      if (config && config.buildSettings) {
        config.buildSettings.DEVELOPMENT_TEAM = developmentTeam;
      }
    }
    return mod;
  });
};
