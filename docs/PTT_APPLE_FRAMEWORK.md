# Apple Push To Talk Framework Reference

> Source: Apple Developer Documentation — https://developer.apple.com/documentation/pushtotalk?language=objc
> Availability: iOS 16.0+ · iPadOS 16.0+ · Mac Catalyst 16.0+
> **Not available** in compatible iPad/iPhone apps running on visionOS.

---

## Overview

The Push to Talk framework is a power-efficient, user-friendly, and privacy-focused API. It provides system user interface controls that allow users to transmit audio from anywhere. It supplies an ephemeral APNs token so the system can wake the app in the background to handle incoming audio while a session is ongoing.

PTT provides the interface; the app provides the back-end communication service. It is flexible and compatible with existing end-to-end communication solutions and backend infrastructure. PTT also integrates with Bluetooth accessories that trigger audio recording and transmission.

---

## Xcode Project Configuration

1. Select the top-level project in the Xcode Project navigator.
2. For the target, choose **Signing & Capabilities**.
3. **Editor → Add Capability → Background Modes** → select **Push to Talk**.
4. **Editor → Add Capability → Push to Talk**.
5. **Editor → Add Capability → Push Notifications**.
6. In **Info**, add key `NSMicrophoneUsageDescription` with a string explaining microphone access.

---

## Classes

### `PTChannelManager`

An object that represents a push-to-talk channel manager.

```objc
@interface PTChannelManager : NSObject
```

Create the channel manager as soon as possible during app launch so the system can restore existing channels and deliver push notifications. Multiple calls to `channelManagerWithDelegate:restorationDelegate:completionHandler:` return the same shared instance — store it in an instance variable.

Only one PTT channel can be active on the system at a time.

#### Creating a channel manager

```objc
+ (void)channelManagerWithDelegate:(id<PTChannelManagerDelegate>)delegate
               restorationDelegate:(id<PTChannelRestorationDelegate>)restorationDelegate
                 completionHandler:(void (^)(PTChannelManager *manager, NSError *error))completionHandler;
```

**Parameters**
- `delegate` — An object conforming to `PTChannelManagerDelegate`.
- `restorationDelegate` — An object conforming to `PTChannelRestorationDelegate`.
- `completionHandler` — Called with the new manager instance or an error.

Swift async equivalent:
```swift
class func channelManager(delegate: PTChannelManagerDelegate,
                          restorationDelegate: PTChannelRestorationDelegate) async throws -> PTChannelManager
```

#### Inspecting the channel manager

```objc
@property (nonatomic, strong, readonly) NSUUID *activeChannelUUID;
```

`nil` when there is no active PTT channel. When non-nil, the channel is active in the system UI and the ephemeral push token is usable. Only one channel can be active at a time.

#### Joining and leaving a channel

```objc
- (void)requestJoinChannelWithUUID:(NSUUID *)channelUUID
                        descriptor:(PTChannelDescriptor *)descriptor;
```

Joins a channel. Can only be called from the **foreground**. On success, calls `channelManager:didJoinChannelWithUUID:reason:` with `PTChannelJoinReasonDeveloperRequest`. On failure, calls `channelManager:failedToJoinChannelWithUUID:error:`.

Store the UUID and descriptor for later use — the system uses the same UUID throughout the channel's lifetime.

```objc
- (void)leaveChannelWithUUID:(NSUUID *)channelUUID;
```

Leaves a channel. On success, calls `channelManager:didLeaveChannelWithUUID:reason:` with `PTChannelLeaveReasonDeveloperRequest`. On failure, calls `channelManager:failedToLeaveChannelWithUUID:error:`.

#### Setting the transmission mode

```objc
- (void)setTransmissionMode:(PTTransmissionMode)transmissionMode
             forChannelUUID:(NSUUID *)channelUUID
          completionHandler:(void (^)(NSError *))completionHandler;
```

Default mode is `PTTransmissionModeHalfDuplex`. Use `PTTransmissionModeFullDuplex` to allow simultaneous send/receive. Use `PTTransmissionModeListenOnly` to prevent the local participant from transmitting.

Swift async equivalent:
```swift
func setTransmissionMode(_ transmissionMode: PTTransmissionMode, channelUUID: UUID) async throws
```

#### Starting and stopping transmission

```objc
- (void)requestBeginTransmittingWithChannelUUID:(NSUUID *)channelUUID;
```

Begins audio transmission. Can only be called from the **foreground** or following a Core Bluetooth characteristic change. On success, calls `channelManager:channelUUID:didBeginTransmittingFromSource:`. On failure, calls `channelManager:failedToBeginTransmittingInChannelWithUUID:error:`.

The system automatically interprets play/pause toggle events from wired headsets and CarPlay devices as begin/end transmission events.

```objc
- (void)stopTransmittingWithChannelUUID:(NSUUID *)channelUUID;
```

Stops audio transmission. On success, calls `channelManager:channelUUID:didEndTransmittingFromSource:`. On failure, calls `channelManager:failedToStopTransmittingInChannelWithUUID:error:`.

```objc
- (void)setAccessoryButtonEventsEnabled:(BOOL)enabled
                         forChannelUUID:(NSUUID *)channelUUID
                      completionHandler:(void (^)(NSError *))completionHandler;
```

*(iOS 17.0+)* Maps supported accessory button events to begin/end transmission actions. Set `enabled = NO` if the app handles these events itself.

#### Setting participants

```objc
- (void)setActiveRemoteParticipant:(PTParticipant *)participant
                    forChannelUUID:(NSUUID *)channelUUID
                 completionHandler:(void (^)(NSError *error))completionHandler;
```

Sets the active remote participant. Pass a `PTParticipant` when incoming audio starts — this updates the system UI and **blocks local transmission**. Pass `nil` when the remote participant finishes speaking to release the audio session and allow the local user to transmit again.

> **Critical:** Always call with `nil` when remote audio ends, otherwise the channel becomes stuck.

Swift async equivalent:
```swift
func setActiveRemoteParticipant(_ participant: PTParticipant?, channelUUID: UUID) async throws
```

#### Setting the channel descriptor

```objc
- (void)setChannelDescriptor:(PTChannelDescriptor *)channelDescriptor
              forChannelUUID:(NSUUID *)channelUUID
           completionHandler:(void (^)(NSError *error))completionHandler;
```

Updates the system UI with new channel details. Use this to support multiple simultaneous conversations within a single channel — call it when the active conversation changes instead of rejoining.

Swift async equivalent:
```swift
func setChannelDescriptor(_ channelDescriptor: PTChannelDescriptor, channelUUID: UUID) async throws
```

#### Setting the service status

```objc
- (void)setServiceStatus:(PTServiceStatus)status
          forChannelUUID:(NSUUID *)channelUUID
       completionHandler:(void (^)(NSError *))completionHandler;
```

Reports network connectivity to the PTT system UI. Default is `PTServiceStatusReady`. Call with `PTServiceStatusConnecting` during a network outage and `PTServiceStatusReady` when restored.

Swift async equivalent:
```swift
func setServiceStatus(_ status: PTServiceStatus, channelUUID: UUID) async throws
```

---

### `PTChannelDescriptor`

An object that describes a channel shown in the system UI.

```objc
@interface PTChannelDescriptor : NSObject
```

```objc
- (instancetype)initWithName:(NSString *)name image:(UIImage *)image;
```

**Properties**
```objc
@property (nonatomic, copy, readonly) NSString *name;
@property (nonatomic, copy, readonly) UIImage  *image;
```

---

### `PTParticipant`

An object that represents a channel participant.

```objc
@interface PTParticipant : NSObject
```

```objc
- (instancetype)initWithName:(NSString *)name image:(UIImage *)image;
```

**Properties**
```objc
@property (nonatomic, copy, readonly) NSString *name;
@property (nonatomic, copy, readonly) UIImage  *image;
```

Use with `setActiveRemoteParticipant:forChannelUUID:completionHandler:` to update the name and image shown in the system UI.

---

### `PTPushResult`

An object that represents the result of an incoming PTT push notification.

```objc
@interface PTPushResult : NSObject
```

Return from `incomingPushResultForChannelManager:channelUUID:pushPayload:` immediately — do not block the thread.

#### Class methods / properties

```objc
// Report an active remote speaker (updates system UI, activates audio session)
+ (PTPushResult *)pushResultForActiveRemoteParticipant:(PTParticipant *)participant;

// Remove the user from the channel
@property (class, nonatomic, readonly) PTPushResult *leaveChannelPushResult;
```

> **Note on correct ObjC names:** The Swift shorthand `.activeRemoteParticipant(participant)` and `.leaveChannel` used in Apple's Swift sample code map to the ObjC class method `pushResultForActiveRemoteParticipant:` and the class property `leaveChannelPushResult`. Using the wrong names causes a compile error.

---

## Protocols

### `PTChannelManagerDelegate`

Lifecycle callbacks for a channel manager.

```objc
// Channel joined/left
- (void)channelManager:(PTChannelManager *)channelManager
    didJoinChannelWithUUID:(NSUUID *)channelUUID
                    reason:(PTChannelJoinReason)reason;

- (void)channelManager:(PTChannelManager *)channelManager
    didLeaveChannelWithUUID:(NSUUID *)channelUUID
                     reason:(PTChannelLeaveReason)reason;

// Transmission begin/end
- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    didBeginTransmittingFromSource:(PTChannelTransmitRequestSource)source;

- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    didEndTransmittingFromSource:(PTChannelTransmitRequestSource)source;

// Audio session — do NOT activate/deactivate manually; let the system manage it
- (void)channelManager:(PTChannelManager *)channelManager
    didActivateAudioSession:(AVAudioSession *)audioSession;
    // → begin recording or playback here

- (void)channelManager:(PTChannelManager *)channelManager
    didDeactivateAudioSession:(AVAudioSession *)audioSession;
    // → stop recording or playback here

// Ephemeral APNs push token — send to server; valid only while channel is active
- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    receivedEphemeralPushToken:(NSData *)pushToken;

// Incoming push notification — return a PTPushResult immediately, no blocking work
- (PTPushResult *)incomingPushResultForChannelManager:(PTChannelManager *)channelManager
                                          channelUUID:(NSUUID *)channelUUID
                                          pushPayload:(NSDictionary *)pushPayload;

// Remote participant changed
- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    activeRemoteParticipantDidChange:(PTParticipant *)participant;
    // participant == nil → remote audio ended, call setActiveRemoteParticipant:nil

// Failure callbacks
- (void)channelManager:(PTChannelManager *)channelManager
    failedToJoinChannelWithUUID:(NSUUID *)channelUUID
                          error:(NSError *)error;

- (void)channelManager:(PTChannelManager *)channelManager
    failedToLeaveChannelWithUUID:(NSUUID *)channelUUID
                           error:(NSError *)error;

- (void)channelManager:(PTChannelManager *)channelManager
    failedToBeginTransmittingInChannelWithUUID:(NSUUID *)channelUUID
                                         error:(NSError *)error;

- (void)channelManager:(PTChannelManager *)channelManager
    failedToStopTransmittingInChannelWithUUID:(NSUUID *)channelUUID
                                        error:(NSError *)error;
```

### `PTChannelRestorationDelegate`

Called when the system cannot use cached data to restore a channel after a relaunch or device reboot.

```objc
@protocol PTChannelRestorationDelegate <NSObject>

- (PTChannelDescriptor *)channelDescriptorForRestoredChannelUUID:(NSUUID *)channelUUID;
```

Return a descriptor as quickly as possible. Do not perform network requests or blocking work inside this method.

---

## Enumerations

### `PTTransmissionMode`

```objc
enum PTTransmissionMode : NSInteger;

PTTransmissionModeFullDuplex   // Participant can simultaneously receive and transmit
PTTransmissionModeHalfDuplex   // Only one participant can send or receive at a time (default)
PTTransmissionModeListenOnly   // Participant can only receive audio
```

### `PTServiceStatus`

```objc
enum PTServiceStatus : NSInteger;

PTServiceStatusReady        // Service is available (default)
PTServiceStatusConnecting   // Service is attempting to establish a connection
PTServiceStatusUnavailable  // Service is unavailable and needs to be re-established
```

### `PTChannelJoinReason`

```objc
enum PTChannelJoinReason : NSInteger;

PTChannelJoinReasonDeveloperRequest    // App called requestJoinChannelWithUUID: while in foreground
PTChannelJoinReasonChannelRestoration  // App rejoined via channel restoration
```

### `PTChannelLeaveReason`

```objc
enum PTChannelLeaveReason : NSInteger;

PTChannelLeaveReasonUserRequest       // User pressed Leave in the system UI
PTChannelLeaveReasonDeveloperRequest  // App called leaveChannelWithUUID:
PTChannelLeaveReasonSystemPolicy      // A new device restriction took effect
PTChannelLeaveReasonUnknown           // Unknown reason
```

### `PTChannelTransmitRequestSource`

```objc
enum PTChannelTransmitRequestSource : NSInteger;

PTChannelTransmitRequestSourceUserRequest      // User pressed transmit in system UI
PTChannelTransmitRequestSourceDeveloperRequest // App called requestBeginTransmitting:
PTChannelTransmitRequestSourceHandsfreeButton  // User pressed a hands-free device button
PTChannelTransmitRequestSourceUnknown          // Unknown source
```

### `PTChannelError`

```objc
enum PTChannelError : NSInteger;

PTChannelErrorUnknown          // Unknown error
PTChannelErrorAppNotForeground // Operation failed because the app is not in the foreground
PTChannelErrorChannelNotFound  // No active channel with the specified UUID
```

---

## APNs Push Notification Setup

PTT uses a dedicated APNs push type. The token is ephemeral — received in `receivedEphemeralPushToken:` after joining a channel, invalid after leaving.

```sh
curl -v \
    -d '{"activeSpeaker":"The name of the active speaker"}' \
    -H "apns-push-type: pushtotalk" \
    -H "apns-topic: <bundle-id>.voip-ptt" \
    -H "apns-priority: 10" \
    -H "apns-expiration: 0" \
    --http2 \
    --cert <cert>.pem \
    https://api.sandbox.push.apple.com/3/device/<token>
```

- Push type: `pushtotalk`
- Topic: `<bundle-id>.voip-ptt`
- Priority: `10` (immediate delivery)
- Expiration: `0` (do not deliver stale pushes)

The payload can contain custom keys (e.g. `activeSpeaker`, `senderName`). These are passed to `incomingPushResultForChannelManager:channelUUID:pushPayload:`.

---

## Audio Session Rules

- **Never** activate or deactivate the audio session manually. The PTT framework manages audio session priority.
- Wait for `channelManager:didActivateAudioSession:` before recording or playing back audio.
- Stop recording/playback in `channelManager:didDeactivateAudioSession:`.
- The system provides built-in sound effects for mic activation/deactivation. Do not add custom ones.
- After transmitting ends, use `beginBackgroundTaskWithExpirationHandler:` if extra runtime is needed to update the server.

In `PTTransmissionModeFullDuplex`, `didActivateAudioSession:` is not called when transmission begins if the audio session is already active from receiving audio.

---

## Multiple Conversations

To support simultaneous conversations in a single channel:
1. Join one channel.
2. Call `setChannelDescriptor:forChannelUUID:completionHandler:` to update the system UI when the active conversation changes.
3. While receiving audio, call `setActiveRemoteParticipant:forChannelUUID:completionHandler:` to update the system UI with new participant details when the speaker changes — no need to send a new APNs notification.

---

## Network Latency

Use the Network framework with QUIC to reduce TLS handshake overhead and improve initial connection speed. Handle `AVAudioSession` notifications for session interruptions, route changes, and failures — the system prioritizes cellular, FaceTime, and VoIP calls over PTT.

---

## GatherSafe Implementation Notes

The GatherSafe ObjC module (`PushToTalkModule.m`) uses `__has_include(<PushToTalk/PushToTalk.h>)` as the compile-time guard instead of Swift's `canImport`. This is required because `iPhoneOS26.0.sdk` removed the Swift module overlay for `PushToTalk.framework` while keeping the ObjC headers — Swift's `canImport` returns `true` (binary is present) but all `PTT*` Swift types are absent.

Key JS-facing methods exposed to React Native:
| JS Method | PTChannelManager call |
|---|---|
| `initialize(channelId, channelName)` | `channelManagerWithDelegate:` + `requestJoinChannelWithUUID:descriptor:` |
| `startTransmitting(channelId)` | `requestBeginTransmittingWithChannelUUID:` |
| `stopTransmitting(channelId)` | `stopTransmittingWithChannelUUID:` |
| `leaveChannel(channelId)` | `leaveChannelWithUUID:` |
| `setActiveRemoteParticipant(channelId, participantName\|null)` | `setActiveRemoteParticipant:forChannelUUID:` |
| `setServiceStatus(channelId, "ready"\|"connecting"\|"unavailable")` | `setServiceStatus:forChannelUUID:` |
