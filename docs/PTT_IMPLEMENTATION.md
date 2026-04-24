# PTT Implementation Guide

GatherSafe PTT uses **LiveKit** as the WebRTC audio SFU, with three platform-specific paths for audio session ownership and background operation:

| Platform | Audio path | Background keep-alive |
|---|---|---|
| iOS 16+ | Apple PTT framework (`PTChannelManager`) owns session; LiveKit mic track muted/unmuted on demand | System-managed ephemeral APNs wake-ups via `pushtotalk` push type |
| Android | LiveKit owns session directly; `ConnectionService` (CallKit) keeps audio alive | Foreground service with persistent notification |
| Web | LiveKit `Room` + MediaRecorder for chunked upload via Socket.IO | N/A |

---

## Packages

```
# Mobile app
@livekit/react-native      ^2.0.0   # React Native bindings + AudioSession
@livekit/react-native-webrtc ^144.0.0 # Native WebRTC module (peer dep)
livekit-client             ^2.18.1  # Room, RoomEvent, createLocalAudioTrack

# Server
livekit-server-sdk         ^2.6.0   # AccessToken, RoomServiceClient, EgressClient
```

---

## Native Module Initialization

These calls must happen at process startup before any LiveKit API is used.

### iOS — `AppDelegate.m`

```objc
#import "LivekitReactNative.h"

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  [LivekitReactNative setup];
  // ...
}
```

### Android — `MainApplication.kt`

```kotlin
import com.livekit.reactnative.LiveKitReactNative
import com.livekit.reactnative.audio.AudioType

override fun onCreate() {
  // Must come before all React Native initialization
  LiveKitReactNative.setup(this, AudioType.CommunicationAudioType())
  // ...
}
```

`CommunicationAudioType` routes audio through the earpiece/speaker path used by phone calls. Use `MediaAudioType` only if the device will never publish audio.

### `index.js` (JavaScript entry point)

```ts
import { registerGlobals } from '@livekit/react-native';
registerGlobals(); // installs WebRTC globals required by livekit-client
```

---

## Android Manifest Permissions

```xml
<!-- Background audio -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<!-- Declare the foreground service -->
<service android:name="com.supersami.foregroundservice.ForegroundService"
  android:foregroundServiceType="microphone|mediaPlayback" />
```

---

## iOS Entitlements & Info.plist

Add these capabilities in Xcode (Signing & Capabilities):
- **Background Modes** → `audio`, `voip`, **Push to Talk** (iOS 16+)
- **Push to Talk** capability
- **Push Notifications**

Add to `Info.plist`:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>GatherSafe needs the microphone for push-to-talk communication.</string>
```

---

## Server: Token Generation

File: `server/src/config/livekit.ts`

```ts
import { AccessToken } from 'livekit-server-sdk';

export async function generateLiveKitToken(
  userId: string,
  displayName: string,
  groupId: string,
): Promise<string> {
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: userId, name: displayName, ttl: '6h' },
  );
  token.addGrant({
    room:           `ptt:${groupId}`,
    roomJoin:       true,
    canPublish:     true,
    canSubscribe:   true,
    canPublishData: true,
  });
  return token.toJwt();
}
```

**Room naming convention:** `ptt:<groupId>` — used consistently across server and client so socket room membership and LiveKit room membership stay in sync.

**Token lifetime:** 6 hours. Clients that stay joined longer than 6 hours will be disconnected by LiveKit when the token expires; the `RoomEvent.Disconnected` handler in `PTTContext` must reconnect or prompt the user to rejoin.

---

## Server: Egress (Audio Recording)

File: `server/src/services/ptt/livekitService.ts`

Egress records the transmitting user's audio track to S3-compatible storage (Supabase Storage in production).

### Why TrackCompositeEgress

`startTrackCompositeEgress` records a single participant's audio (and optionally video) track directly to a file, with no server-side mixing overhead. For PTT this means one MP4 file per transmission — each `ptt:start` event creates a new egress, each `ptt:stop` stops it.

### Timing constraint — track must be published first

The egress call needs the participant's audio track SID (`audioTrack.sid`). The SID is only available **after the client has published the track to the LiveKit room**. GatherSafe pre-publishes the mic track muted at join time so the SID is ready before the first `ptt:start` arrives. If `listParticipants` returns no audio track for the user, egress is skipped with a warning — this is the most common cause of silent recordings.

```ts
import {
  EgressClient, RoomServiceClient,
  EncodedFileOutput, EncodedFileType,
  S3Upload, TrackType,
} from 'livekit-server-sdk';

// Find the participant's published audio track SID
const participants = await rooms.listParticipants(`ptt:${groupId}`);
const participant  = participants.find(p => p.identity === userId);
const audioTrack   = participant?.tracks.find(t => t.type === TrackType.AUDIO);
if (!audioTrack?.sid) {
  // Track not yet published — egress skipped
  return;
}

// Configure S3-compatible output (Supabase Storage)
const output = new EncodedFileOutput({
  fileType:        EncodedFileType.MP4,
  filepath:        `${groupId}/${userId}_{time}.mp4`, // {time} = Unix ms at egress start
  disableManifest: true,
  output: {
    case:  's3',
    value: new S3Upload({
      accessKey:      process.env.SUPABASE_S3_KEY_ID,
      secret:         process.env.SUPABASE_S3_ACCESS_SECRET,
      region:         process.env.SUPABASE_S3_REGION,
      endpoint:       process.env.SUPABASE_S3_ENDPOINT, // e.g. https://<project>.supabase.co/storage/v1/s3
      bucket:         process.env.SUPABASE_PTT_BUCKET,
      forcePathStyle: true,  // required for Supabase and most non-AWS S3 providers
    }),
  },
});

// Start egress — pass only the audio track SID (no video for PTT)
const egress = await egressClient.startTrackCompositeEgress(
  `ptt:${groupId}`,
  output,
  audioTrack.sid,   // audioTrackId
  undefined,        // videoTrackId — omit for audio-only
);

// Persist egress ID in Redis so stopTransmissionEgress can find it
await redis.setex(`ptt:egress:${userId}:${groupId}`, 3600, egress.egressId);
```

### Stopping egress

```ts
const egressId = await redis.get(`ptt:egress:${userId}:${groupId}`);
if (egressId) {
  await egressClient.stopEgress(egressId);
  await redis.del(`ptt:egress:${userId}:${groupId}`);
}
```

### S3 filepath template variables

| Variable | Expands to |
|---|---|
| `{time}` | Unix timestamp at egress start (seconds) |
| `{utc}` | ISO 8601 UTC timestamp |
| `{room_name}` | LiveKit room name |
| `{publisher_identity}` | Participant identity (userId) |
| `{track_id}` | Track SID |

---

## Client: AudioSession Management

File: `src/contexts/PTTContext.tsx`

`AudioSession` from `@livekit/react-native` wraps `AVAudioSession` (iOS) and `AudioManager` (Android).

```ts
import { AudioSession } from '@livekit/react-native';

// Start before connecting to the room (non-iOS-native-PTT path only)
// On iOS with PTT framework, the system activates the session via
// onAudioActivated — never call startAudioSession manually there.
AudioSession.startAudioSession();

// Stop on leave / disconnect
AudioSession.stopAudioSession();
```

**iOS + Apple PTT framework:** Do NOT call `startAudioSession` manually. The system calls `channelManager:didActivateAudioSession:` when it is safe to use the mic; call `startAudioSession` there instead. Calling it too early contends with the system and causes the audio session to be deactivated unexpectedly.

**Android + CallKit:** When `RNCallKeep` fires `didActivateAudioSession` / `didDeactivateAudioSession`, forward those events to the WebRTC layer:

```ts
RNCallKeep.addEventListener('didActivateAudioSession',   () => RTCAudioSession.audioSessionDidActivate());
RNCallKeep.addEventListener('didDeactivateAudioSession', () => RTCAudioSession.audioSessionDidDeactivate());
```

---

## Client: Connecting to a LiveKit Room

```ts
import {
  Room, RoomEvent, createLocalAudioTrack,
} from 'livekit-client';

const room = new Room({
  audioCaptureDefaults: {
    echoCancellation:  true,
    noiseSuppression:  true,
    autoGainControl:   true,
  },
  dynacast: false, // PTT is push-only; dynacast (adaptive quality) is unused
});

// Attach event listeners before connecting
room.on(RoomEvent.ParticipantConnected,    participant => { /* update member list */ });
room.on(RoomEvent.ParticipantDisconnected, participant => { /* update member list */ });
room.on(RoomEvent.ActiveSpeakersChanged,   speakers   => { /* update active speaker */ });
room.on(RoomEvent.Reconnecting,            ()         => { /* show "connecting…" */ });
room.on(RoomEvent.Reconnected,             ()         => { /* clear "connecting…" */ });
room.on(RoomEvent.Disconnected,            ()         => { /* tear down UI */ });

await room.connect(livekitUrl, token, { autoSubscribe: true });
```

**`autoSubscribe: true`** is required so incoming audio from other participants is automatically received and played.

---

## Client: Pre-Publishing the Mic Track (PTT Pattern)

Publishing the mic track at join time and keeping it muted between transmissions gives instant PTT response — there is no WebRTC negotiation delay when the button is pressed.

```ts
// After room.connect()
try {
  const micTrack = await createLocalAudioTrack({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl:  true,
  });

  await room.localParticipant.publishTrack(micTrack, {
    dtx:          true,    // Discontinuous Transmission — saves bandwidth when muted
    audioBitrate: 16_000,  // 16 kbps: adequate for voice, battery-friendly
  });

  micTrack.mute();        // Start muted; unmute only during transmission
  micTrackRef.current = micTrack;
} catch (err) {
  // Fallback: on-demand enable (longer PTT latency, but still functional)
  await room.localParticipant.setMicrophoneEnabled(false);
}
```

**Why `dtx: true`:** DTX suppresses audio packets when the mic is muted, reducing network overhead to near zero between transmissions.

**Why avoid `audio={true}` on `LiveKitRoom`:** Auto-publish via the `audio` prop has a known race where `trackID` is undefined during the initial publish, causing a runtime crash. Always publish manually after `room.connect()`.

### Mute / Unmute during PTT

```ts
// Button pressed — start transmitting
micTrackRef.current.unmute();

// Button released — stop transmitting
micTrackRef.current.mute();
```

If the pre-publish failed and `micTrackRef.current` is null, fall back to:

```ts
await room.localParticipant.setMicrophoneEnabled(true);  // press
await room.localParticipant.setMicrophoneEnabled(false); // release
```

---

## iOS Native PTT Path (Apple Push-to-Talk Framework)

> Full API reference: `docs/PTT_APPLE_FRAMEWORK.md`

The Apple PTT framework (`PushToTalk.framework`, iOS 16+) provides system-level UI (Dynamic Island / lock screen pill), hardware button mapping, and ephemeral APNs wakeups. GatherSafe's ObjC bridge (`PushToTalkModule.m`) exposes these JS-facing methods:

| JS method | `PTChannelManager` call |
|---|---|
| `initialize(channelId, channelName)` | `channelManagerWithDelegate:` + `requestJoinChannelWithUUID:descriptor:` |
| `startTransmitting(channelId)` | `requestBeginTransmittingWithChannelUUID:` |
| `stopTransmitting(channelId)` | `stopTransmittingWithChannelUUID:` |
| `leaveChannel(channelId)` | `leaveChannelWithUUID:` |
| `setActiveRemoteParticipant(channelId, name\|null)` | `setActiveRemoteParticipant:forChannelUUID:` |
| `setServiceStatus(channelId, "ready"\|"connecting"\|"unavailable")` | `setServiceStatus:forChannelUUID:` |

### iOS PTT lifecycle in PTTContext

```
joinChannel()
  └─ nativePTTService.joinChannel(groupId, groupName)
       └─ PTChannelManager.requestJoinChannelWithUUID:descriptor:
            → onPushTokenReceived  →  POST /ptt/:groupId/register-token
            → setServiceStatus("ready")

User presses PTT button
  └─ nativePTTService.startTransmitting(channelId)
       └─ PTChannelManager.requestBeginTransmittingWithChannelUUID:
            → onTransmissionStarted   (set UI to transmitting)
            → onAudioActivated        (system gave us the audio session)
                 └─ micTrack.unmute()
                 └─ socket.emit('ptt:start', { groupId })
                      └─ server: startTransmissionEgress()

User releases PTT button
  └─ nativePTTService.stopTransmitting(channelId)
       └─ PTChannelManager.stopTransmittingWithChannelUUID:
            → onTransmissionEnded
                 └─ micTrack.mute()
                 └─ socket.emit('ptt:stop', { groupId })
                 └─ socket.emit('ptt:native_log', { groupId, durationMs })
                      └─ server: stopTransmissionEgress()

Remote participant starts speaking
  └─ socket 'ptt:speaking'
       └─ nativePTTService.setActiveRemoteParticipant(channelId, displayName)
            └─ PTChannelManager.setActiveRemoteParticipant:  (blocks local TX, updates system UI)

Remote participant stops speaking
  └─ socket 'ptt:stopped'
       └─ nativePTTService.clearActiveRemoteParticipant(channelId)
            └─ PTChannelManager.setActiveRemoteParticipant:nil  (releases audio session)

leaveChannel()
  └─ nativePTTService.leaveChannel(channelId)
       └─ PTChannelManager.leaveChannelWithUUID:
```

### Critical: `setActiveRemoteParticipant(nil)` must always be called

If `setActiveRemoteParticipant` is called with a participant but never cleared with `nil`, the channel locks — the local user cannot transmit. Always call `clearActiveRemoteParticipant` (which passes `nil`) when the `ptt:stopped` socket event arrives.

### Why `ptt:start` is emitted in `onAudioActivated`, not on button press

The server's `startTransmissionEgress` looks up the participant's audio track SID. If `ptt:start` is emitted before the audio session is active and the mic track is unmuted, LiveKit may not yet show the track as published, causing egress to find no audio track and silently skip recording. Emitting `ptt:start` only after `onAudioActivated` (mic confirmed live) prevents this race.

In the foreground the audio session is often already active, so `onAudioActivated` may not fire. `PTTContext` guards against a double-emit with `pttStartEmittedRef` — `startTransmitting()` also emits `ptt:start` as a fallback for the foreground case.

### ObjC compile guard

`PushToTalkModule.m` uses `__has_include(<PushToTalk/PushToTalk.h>)` rather than Swift's `canImport`. The `iPhoneOS26.0.sdk` removed the Swift module overlay for `PushToTalk.framework` while keeping the ObjC headers, so `canImport` returns `true` but all `PTT*` Swift types are absent at compile time.

### APNs push token flow

After the app joins a PTT channel, `PTChannelManager` delivers an ephemeral push token via `channelManager:channelUUID:receivedEphemeralPushToken:`. This token is valid only while the channel is active. The server must hold it to wake the app when a remote participant starts speaking:

```ts
// Client: register token with server
await fetch(`${apiUrl}/ptt/${groupId}/register-token`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: pushTokenHex }),
});
```

```sh
# Server: send wake-up push when ptt:start fires for offline members
curl -v \
  -d '{"activeSpeaker":"John Smith"}' \
  -H "apns-push-type: pushtotalk" \
  -H "apns-topic: <bundle-id>.voip-ptt" \
  -H "apns-priority: 10" \
  -H "apns-expiration: 0" \
  --http2 --cert <cert>.pem \
  https://api.push.apple.com/3/device/<token>
```

The `incomingPushResultForChannelManager:` delegate method must return a `PTPushResult` immediately (no async work). GatherSafe's module returns `pushResultForActiveRemoteParticipant:` with a `PTParticipant` built from the `activeSpeaker` payload key.

---

## Android Path (ConnectionService + LiveKit)

Android has no system PTT framework. GatherSafe uses `react-native-callkeep` to register a VoIP call with Android's `ConnectionService`, which:

- Keeps the audio session alive in the background
- Shows a persistent notification the user can tap to return to the PTT screen
- Fires `didActivateAudioSession` / `didDeactivateAudioSession` for WebRTC sync

```ts
// On joinChannel (Android)
const uuid = callKitService.startCall(groupName, () => {
  // Call answered → audio session now active, safe to use mic
});

// On leaveChannel (Android)
callKitService.endCall(uuid);
```

LiveKit owns the audio session directly on Android (no native PTT framework). `AudioSession.startAudioSession()` is called at join time and `stopAudioSession()` on leave.

---

## Web Path (MediaRecorder + Socket.IO)

On web, LiveKit handles audio playback for incoming streams automatically. Outgoing audio is captured with `MediaRecorder` and streamed as chunks via Socket.IO:

```ts
// Start transmission (web)
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
recorder.ondataavailable = (e) => {
  socket.emit('ptt:audio_chunk', {
    groupId,
    chunk: e.data,
    mimeType: 'audio/webm',
  });
};
recorder.start(250); // emit chunks every 250 ms
socket.emit('ptt:start', { groupId, mimeType: 'audio/webm' });

// Stop transmission (web)
recorder.stop();
socket.emit('ptt:stop', { groupId });
```

The server buffers chunks in Redis (`ptt:chunks:<userId>:<groupId>`) and reassembles them on `ptt:stop`, then transcodes to M4A via ffmpeg and uploads to Supabase Storage.

---

## Socket.IO Events Reference

| Event | Direction | Payload | Description |
|---|---|---|---|
| `ptt:join` | client → server | `{ groupId }` | Join the socket room; receives current room state |
| `ptt:leave` | client → server | `{ groupId }` | Leave the socket room |
| `ptt:start` | client → server | `{ groupId, mimeType? }` | Begin transmission; server starts egress |
| `ptt:stop` | client → server | `{ groupId }` | End transmission; server stops egress, saves log |
| `ptt:audio_chunk` | client → server | `{ groupId, chunk, mimeType }` | Web-only: raw audio data |
| `ptt:native_log` | client → server | `{ groupId, audioUrl?, durationMs }` | iOS native: log metadata after upload |
| `ptt:room_state` | server → client | `{ groupId, connectedMembers, memberIds }` | Sent to joining client |
| `ptt:member_joined` | server → client | `{ userId, displayName, groupId }` | Broadcast when a member joins |
| `ptt:member_left` | server → client | `{ userId, groupId }` | Broadcast when a member leaves |
| `ptt:speaking` | server → client | `{ groupId, userId, displayName, startedAt }` | A user started transmitting |
| `ptt:stopped` | server → client | `{ groupId, userId, endedAt }` | A user stopped transmitting |
| `ptt:log_saved` | server → client | `{ id, groupId, userId, displayName, audioUrl, durationMs, createdAt }` | Recording available |
| `ptt:error` | server → client | `{ message }` | Error from server |

Sub-group transmissions are also forwarded to the parent lead group's socket room with `fromSubGroup: true` on both `ptt:speaking` and `ptt:stopped`.

---

## Cold Launch / Stale Session Cleanup

When iOS kills the app while a PTT session is active and the user later relaunches (e.g., via the Dynamic Island), the server still considers the user connected. On mount, `PTTContext` checks for stale MMKV keys:

| MMKV key | Value | Purpose |
|---|---|---|
| `ptt_live_activity_id` | Live Activity ID | Dismiss stale Dynamic Island pill |
| `ptt_stale_group_id` | groupId | Emit `ptt:leave` once socket reconnects |
| `ptt_stale_native_channel_id` | channelUUID | Call `leaveChannel` on PTT framework |

These keys are written at `joinChannel` and deleted at `leaveChannel`. If they exist at mount and `isConnected` is false, the previous session ended abnormally.

---

## Environment Variables

### Server (`.env`)

```
LIVEKIT_URL=http://localhost:7880          # LiveKit server WebSocket URL
LIVEKIT_API_KEY=your-livekit-key
LIVEKIT_API_SECRET=your-livekit-secret

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_S3_KEY_ID=...
SUPABASE_S3_ACCESS_SECRET=...
SUPABASE_S3_REGION=ap-southeast-2         # or your Supabase region
SUPABASE_S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3
SUPABASE_PTT_BUCKET=ptt-audio
```

### Mobile app (`.env`)

```
LIVEKIT_URL=ws://localhost:7880
```

The server returns `livekitUrl` in the token response (`GET /ptt/:groupId/token`); the client uses that value and only falls back to `LIVEKIT_URL` if the server omits it.

---

## Known Issues and Gotchas

### 1. Egress silently skipped — "No published audio track"

**Symptom:** Logs show `[LiveKit] No published audio track for <userId> in ptt:<groupId> — egress skipped`.

**Cause:** `ptt:start` arrived at the server before the client's mic track was published to the LiveKit room.

**Fix:** The client pre-publishes the mic track muted at `joinChannel` time. Ensure `room.connect()` and `publishTrack()` both resolve before `socket.emit('ptt:join')`. On the iOS native path, `ptt:start` is emitted from `onAudioActivated`, not from the button press handler, which gives LiveKit time to register the track.

### 2. iOS: double `ptt:start` emit

**Symptom:** Server receives two `ptt:start` events for the same transmission.

**Cause:** Both `startTransmitting()` (foreground path) and `onAudioActivated` (background path) emit `ptt:start`.

**Fix:** `pttStartEmittedRef` is set to `true` on the first emit and checked before the second. It is reset to `false` in `onTransmissionEnded`.

### 3. iOS: channel stuck after remote speaker

**Symptom:** User cannot transmit after a remote participant speaks.

**Cause:** `setActiveRemoteParticipant` was called but never cleared with `nil`.

**Fix:** Always call `nativePTTService.clearActiveRemoteParticipant(channelId)` when `ptt:stopped` arrives. Also call it in `leaveChannel`.

### 4. Android: mic track not publishing after CallKit

**Symptom:** Pre-publish of mic track fails silently; fallback to on-demand `setMicrophoneEnabled` adds latency.

**Cause:** `AudioSession.startAudioSession()` must be called before `publishTrack`. On Android the CallKit `startCall` callback signals audio session readiness — do not call `startAudioSession` before that callback fires.

### 5. Yarn dependency conflicts

**Symptom:** `Cannot read properties of undefined (reading 'split')` at startup.

**Cause:** Yarn installs duplicate versions of `livekit-client`.

**Fix:** Use npm, or run `npx yarn-deduplicate && yarn install`.

### 6. Track SID undefined at publish time

**Symptom:** `trackID is undefined` error in `@livekit/react-native`.

**Cause:** Known SDK race in auto-publish via the `audio` prop on `<LiveKitRoom>`.

**Fix:** Never use `audio={true}` on `<LiveKitRoom>`. Always publish manually with `createLocalAudioTrack` + `publishTrack` after `room.connect()` resolves.

---

## Local Development

```bash
# Start LiveKit dev server (Docker Compose)
docker-compose up -d livekit

# Verify LiveKit is running
curl http://localhost:7880

# Test token generation
cd server && npx ts-node -e "
  import { generateLiveKitToken } from './src/config/livekit';
  generateLiveKitToken('user1', 'Test User', 'group1').then(console.log);
"
```

LiveKit's Docker image runs an in-process egress worker by default in dev mode. For production, deploy the standalone `livekit/egress` container alongside `livekit/livekit-server` and point both at the same Redis instance.
