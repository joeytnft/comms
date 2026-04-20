const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// event-target-shim v6+ lists only "." in its exports field, but transitive
// dependencies (e.g. @livekit/react-native-webrtc) import the "./index"
// subpath directly. Redirect that subpath to the package root so Metro
// resolves it without warnings or fallback heuristics.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'event-target-shim/index') {
    return (originalResolveRequest ?? context.resolveRequest)(
      context,
      'event-target-shim',
      platform,
    );
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
