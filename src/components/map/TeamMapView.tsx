// Type-only shim so TypeScript resolves the platform-split files.
// Metro resolves TeamMapView.native.tsx / TeamMapView.web.tsx at runtime.
export { TeamMapView } from './TeamMapView.native';
