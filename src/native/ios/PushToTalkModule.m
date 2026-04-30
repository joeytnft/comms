#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Import PushToTalk ObjC headers when present in the SDK.
// __has_include checks the .h file — not the Swift module overlay — so this
// evaluates correctly on iPhoneOS26.0.sdk where Apple removed the overlay but
// kept the framework binary and headers.
#if __has_include(<PushToTalk/PushToTalk.h>)
#import <PushToTalk/PushToTalk.h>
#import <AVFoundation/AVFoundation.h>
#import <CommonCrypto/CommonCrypto.h>
#define PTTM_HAS_FRAMEWORK 1
#endif

// WebRTC audio session — needed to sync the WebRTC stack with the PTT framework's
// audio session lifecycle. Without these calls LiveKit cannot capture or play audio
// on iOS native PTT (same pattern used by CallKit integrations).
#if __has_include(<WebRTC/RTCAudioSession.h>)
#import <WebRTC/RTCAudioSession.h>
#define PTTM_HAS_WEBRTC 1
#endif

// ─── Interface ────────────────────────────────────────────────────────────────

@interface PushToTalkModule : RCTEventEmitter <RCTBridgeModule>
@end

#ifdef PTTM_HAS_FRAMEWORK
// Declare PTT delegate conformances in a conditional category so they are
// only visible to the compiler when the framework headers are available.
@interface PushToTalkModule (PTTDelegates) <PTChannelManagerDelegate,
                                            PTChannelRestorationDelegate>
@end
#endif

// Private helpers — declared so the compiler resolves selectors used from
// inside async completion blocks defined earlier in the file.
@interface PushToTalkModule (Private)
- (void)_registerAudioInterruptionObservers;
- (void)_handleAudioInterruption:(NSNotification *)notif;
- (void)_handleRouteChange:(NSNotification *)notif;
@end

// ─── Implementation ───────────────────────────────────────────────────────────

@implementation PushToTalkModule {
#ifdef PTTM_HAS_FRAMEWORK
    PTChannelManager    *_channelManager;
    NSUUID              *_channelUUID;
    PTChannelDescriptor *_channelDescriptor;
    // Set in didJoinChannelWithUUID delegate. When iOS restores a channel after
    // a crash or reboot the framework rejoins on its own — calling
    // requestJoinChannelWithUUID again raises because only one channel may be
    // joined at a time, and @try/@catch around that call is unreliable across
    // the framework's internal dispatch boundaries. Tracking join state lets us
    // skip the redundant join request entirely.
    BOOL _isChannelJoined;
    // Tracks whether we're mid-transmission. Used in incomingPushResult to
    // honour Apple's half-duplex contract: if a remote push arrives while the
    // local user is transmitting, we MUST stop transmitting before returning
    // an active remote participant or the framework throws.
    BOOL _isTransmitting;
    // Set true when AVAudioSession observers have been wired up so we don't
    // double-register on subsequent channel joins.
    BOOL _audioObserversRegistered;
    // Set true immediately before calling leaveChannelWithUUID so the
    // didLeaveChannelWithUUID delegate can distinguish our explicit leave from
    // the stale leave iOS queues for the previous session when initialize() is
    // called. Group IDs produce a deterministic UUID v5, so the previous and
    // current session share the same UUID — without this flag the stale leave
    // clears _channelUUID and every subsequent requestBeginTransmitting rejects
    // with PTT_NOT_INITIALIZED, making PTT work only once per app launch.
    BOOL _isLeavingIntentionally;
    // Set in incomingPushResultForChannelManager when we receive a stop push (no
    // activeSpeaker). We return leaveChannelPushResult to satisfy Apple's non-nil
    // requirement, but we don't want the JS layer to see a channel-left event —
    // we self-heal immediately in didLeaveChannelWithUUID with this flag set.
    BOOL _isLeaveFromStopPush;
#endif
    BOOL _hasListeners;
}

RCT_EXPORT_MODULE(PushToTalkModule)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (NSArray<NSString *> *)supportedEvents {
    return @[
        @"onPTTChannelJoined",    @"onPTTChannelLeft",
        @"onPTTTransmitStart",    @"onPTTTransmitStop",
        @"onPTTReceiveStart",     @"onPTTReceiveStop",
        @"onPTTPushToken",        @"onPTTError",
        @"onPTTAudioActivated",   @"onPTTAudioDeactivated",
    ];
}

- (void)startObserving { _hasListeners = YES; }
- (void)stopObserving  { _hasListeners = NO;  }

- (void)emit:(NSString *)name body:(id)body {
    if (_hasListeners) [self sendEventWithName:name body:body];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Returns a well-formed, deterministic UUID for any string (UUID v5, DNS namespace).
// Group IDs are CUIDs — not valid UUIDs — so we can't pass them directly to
// CXChannelAction/PTChannelManager which requires an RFC 4122 UUID.  Using a
// deterministic derivation means the same UUID is produced every app launch for
// the same group, which allows PTChannelManager to restore the channel after a
// crash or reboot without UUID mismatch.
+ (NSUUID *)channelUUIDForID:(NSString *)channelId {
    // Fast path: channelId is already a valid UUID string.
    NSUUID *parsed = [[NSUUID alloc] initWithUUIDString:channelId];
    if (parsed) return parsed;

    // UUID v5: SHA1(namespace || name), then set version/variant bits.
    // Namespace: OID (6ba7b812-9dad-11d1-80b4-00c04fd430c8)
    uint8_t ns[16] = {
        0x6b, 0xa7, 0xb8, 0x12, 0x9d, 0xad, 0x11, 0xd1,
        0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
    };
    NSData *name = [channelId dataUsingEncoding:NSUTF8StringEncoding];
    NSMutableData *buf = [NSMutableData dataWithBytes:ns length:sizeof(ns)];
    [buf appendData:name];

    uint8_t sha[CC_SHA1_DIGEST_LENGTH];
    CC_SHA1(buf.bytes, (CC_LONG)buf.length, sha);

    sha[6] = (sha[6] & 0x0F) | 0x50; // version 5
    sha[8] = (sha[8] & 0x3F) | 0x80; // variant RFC 4122

    return [[NSUUID alloc] initWithUUIDBytes:sha];
}

// ─── JS-facing methods ────────────────────────────────────────────────────────

/**
 * Create the PTChannelManager singleton at app launch — BEFORE any channel
 * is joined. Apple's docs:
 *
 *   "Initialize the channel manager as soon as possible during startup to
 *    ensure the framework can restore existing channels and deliver push
 *    notifications to the app."
 *
 * Without an early preinit, a PT channel that iOS persists across app
 * relaunches (e.g. after a crash) cannot be restored: the framework needs
 * a live channelManager + restorationDelegate to call back into. JS calls
 * this from PTTProvider mount; subsequent calls are no-ops because
 * channelManagerWithDelegate returns the same shared instance.
 *
 * Note: useManualAudio = YES is intentionally NOT set here — that switch
 * is what tells WebRTC the framework owns the audio session, and we only
 * want it on while a channel is actually joined. It gets flipped inside
 * the initialize: method below.
 */
RCT_EXPORT_METHOD(preinit:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        if (_channelManager) { resolve(nil); return; }
        __weak typeof(self) weak = self;
        [PTChannelManager channelManagerWithDelegate:self
                                restorationDelegate:self
                                  completionHandler:^(PTChannelManager *mgr, NSError *err) {
            __strong typeof(weak) strong = weak;
            if (!strong) { resolve(nil); return; }
            if (err) {
                reject(@"PTT_PREINIT_ERROR", err.localizedDescription, err);
                return;
            }
            strong->_channelManager = mgr;
            [strong _registerAudioInterruptionObservers];
            resolve(nil);
        }];
        return;
    }
#endif
    resolve(nil);
}

RCT_EXPORT_METHOD(initialize:(NSString *)channelId
                  channelName:(NSString *)channelName
                  channelUUID:(NSString *)channelUUIDString
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        // Prefer the UUID JS provided (a fresh per-join UUID v4 stored in
        // MMKV). Fall back to the deterministic UUID v5 derivation only when
        // JS didn't pass one — this preserves the legacy behaviour for any
        // call site that hasn't been updated yet.
        //
        // Why fresh UUIDs instead of derived ones: deriving the UUID from the
        // group ID meant every join produced the SAME UUID. iOS queues a
        // didLeaveChannelWithUUID for the previous session whenever
        // requestJoinChannelWithUUID is called, and because old/new sessions
        // shared a UUID, the stale leave was indistinguishable from a real
        // one. Most of the "second press fails" history traces to this. With
        // fresh UUIDs the previous and current sessions have different UUIDs
        // and the stale leave just refers to a channel we've already left.
        NSUUID *targetUUID = nil;
        if (channelUUIDString.length > 0) {
            targetUUID = [[NSUUID alloc] initWithUUIDString:channelUUIDString];
        }
        if (!targetUUID) {
            targetUUID = [PushToTalkModule channelUUIDForID:channelId];
        }
        _channelUUID       = targetUUID;
        _channelDescriptor = [[PTChannelDescriptor alloc] initWithName:channelName image:nil];
        __weak typeof(self) weak = self;
        [PTChannelManager channelManagerWithDelegate:self
                                restorationDelegate:self
                                  completionHandler:^(PTChannelManager *mgr, NSError *err) {
            if (err) { reject(@"PTT_INIT_ERROR", err.localizedDescription, err); return; }
            __strong typeof(weak) strong = weak;
            if (!strong) { resolve(nil); return; }
            strong->_channelManager = mgr;
            [strong _registerAudioInterruptionObservers];

            // Take WebRTC out of automatic-audio mode for the entire PTT session.
            // While a PT channel is joined, Apple's PushToTalk framework owns the
            // AVAudioSession lifecycle; if WebRTC (or our own JS code) calls
            // setActive:YES on the session outside requestBeginTransmittingWithChannelUUID,
            // iOS treats it as a contract violation and fires didLeaveChannel.
            // Manual mode means the framework activates the session on transmit and
            // we explicitly enable WebRTC audio in didActivateAudioSession below.
#ifdef PTTM_HAS_WEBRTC
            RTCAudioSession *rtcSession = [RTCAudioSession sharedInstance];
            rtcSession.useManualAudio = YES;
            rtcSession.isAudioEnabled = NO;
#endif

            // If iOS already restored this channel (crash recovery / reboot), the
            // framework rejoined on its own — calling requestJoinChannelWithUUID
            // again raises an uncatchable NSException from CXChannelAction and
            // terminates the process. Skip the join request in that case and
            // return the existing UUID directly.
            if (strong->_isChannelJoined && [strong->_channelUUID isEqual:targetUUID]) {
                resolve(targetUUID.UUIDString);
                return;
            }

            @try {
                [mgr requestJoinChannelWithUUID:targetUUID
                                     descriptor:strong->_channelDescriptor];
                resolve(targetUUID.UUIDString);
            } @catch (NSException *exception) {
                // Treat "already joined" exceptions as success — the channel is
                // still usable, we just didn't know it was already joined (e.g.
                // restoration delegate hadn't fired yet). Any other exception is
                // a real failure.
                NSString *reason = exception.reason ?: @"";
                if ([reason containsString:@"already"] ||
                    [reason containsString:@"exist"]) {
                    strong->_isChannelJoined = YES;
                    resolve(targetUUID.UUIDString);
                } else {
                    reject(@"PTT_JOIN_ERROR",
                           exception.reason ?: @"Failed to join PTT channel",
                           nil);
                }
            }
        }];
        return;
    }
#endif
    reject(@"UNSUPPORTED", @"Push To Talk requires iOS 16 or later", nil);
}

RCT_EXPORT_METHOD(startTransmitting:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        if (!_channelManager || !_channelUUID) {
            reject(@"PTT_NOT_INITIALIZED", @"PTT channel not initialized", nil);
            return;
        }
        [_channelManager requestBeginTransmittingWithChannelUUID:_channelUUID];
        resolve(nil);
        return;
    }
#endif
    reject(@"UNSUPPORTED", @"Push To Talk requires iOS 16 or later", nil);
}

RCT_EXPORT_METHOD(stopTransmitting:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        if (!_channelManager || !_channelUUID) {
            reject(@"PTT_NOT_INITIALIZED", @"PTT channel not initialized", nil);
            return;
        }
        [_channelManager stopTransmittingWithChannelUUID:_channelUUID];
        resolve(nil);
        return;
    }
#endif
    reject(@"UNSUPPORTED", @"Push To Talk requires iOS 16 or later", nil);
}

/**
 * Re-join the current PTT channel without going through a full initialize().
 *
 * Called from JS when the cleanupLeaveRef window consumes a stale
 * didLeaveChannelWithUUID event — iOS considers the channel left (it closed the
 * previous session), but we preserved _channelUUID.  Calling
 * requestJoinChannelWithUUID here restores the framework's joined state so
 * subsequent requestBeginTransmittingWithChannelUUID calls succeed instead of
 * firing failedToBeginTransmittingInChannelWithUUID.
 */
RCT_EXPORT_METHOD(rejoinChannel:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        if (!_channelManager || !_channelUUID || !_channelDescriptor) {
            reject(@"PTT_NOT_INITIALIZED", @"PTT channel not initialized", nil);
            return;
        }
        @try {
            [_channelManager requestJoinChannelWithUUID:_channelUUID
                                             descriptor:_channelDescriptor];
            resolve(nil);
        } @catch (NSException *ex) {
            NSString *reason = ex.reason ?: @"";
            if ([reason containsString:@"already"] || [reason containsString:@"exist"]) {
                // Framework already considers the channel joined — that's fine.
                _isChannelJoined = YES;
                resolve(nil);
            } else {
                reject(@"PTT_REJOIN_ERROR",
                       reason.length ? reason : @"Failed to rejoin PTT channel",
                       nil);
            }
        }
        return;
    }
#endif
    // Not iOS 16+ — resolve as no-op; the non-native path doesn't need rejoin.
    resolve(nil);
}

RCT_EXPORT_METHOD(leaveChannel:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        if (!_channelManager || !_channelUUID) {
            reject(@"PTT_NOT_INITIALIZED", @"PTT channel not initialized", nil);
            return;
        }
        _isLeavingIntentionally = YES;
        [_channelManager leaveChannelWithUUID:_channelUUID];
        _channelManager   = nil;
        _channelUUID      = nil;
        _isChannelJoined  = NO;
        resolve(nil);
        return;
    }
#endif
    reject(@"UNSUPPORTED", @"Push To Talk requires iOS 16 or later", nil);
}

// Called by JS after receiving and finishing playback of remote audio.
// Pass nil participantName to release the audio session so local user can transmit.
RCT_EXPORT_METHOD(setActiveRemoteParticipant:(NSString *)channelId
                  participantName:(NSString *)participantName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        if (!_channelManager || !_channelUUID) {
            reject(@"PTT_NOT_INITIALIZED", @"PTT channel not initialized", nil);
            return;
        }
        PTParticipant *participant = participantName
            ? [[PTParticipant alloc] initWithName:participantName image:nil]
            : nil;
        [_channelManager setActiveRemoteParticipant:participant
                                     forChannelUUID:_channelUUID
                                  completionHandler:^(NSError *err) {
            if (err) { reject(@"PTT_PARTICIPANT_ERROR", err.localizedDescription, err); return; }
            resolve(nil);
        }];
        return;
    }
#endif
    reject(@"UNSUPPORTED", @"Push To Talk requires iOS 16 or later", nil);
}

// Report network connectivity to the PTT system UI.
// status: "ready" | "connecting" | "unavailable"
RCT_EXPORT_METHOD(setServiceStatus:(NSString *)channelId
                  status:(NSString *)status
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        if (!_channelManager || !_channelUUID) {
            reject(@"PTT_NOT_INITIALIZED", @"PTT channel not initialized", nil);
            return;
        }
        PTServiceStatus serviceStatus;
        if ([status isEqualToString:@"connecting"]) {
            serviceStatus = PTServiceStatusConnecting;
        } else if ([status isEqualToString:@"unavailable"]) {
            serviceStatus = PTServiceStatusUnavailable;
        } else {
            serviceStatus = PTServiceStatusReady;
        }
        [_channelManager setServiceStatus:serviceStatus
                           forChannelUUID:_channelUUID
                        completionHandler:^(NSError *err) {
            if (err) { reject(@"PTT_STATUS_ERROR", err.localizedDescription, err); return; }
            resolve(nil);
        }];
        return;
    }
#endif
    reject(@"UNSUPPORTED", @"Push To Talk requires iOS 16 or later", nil);
}

// ─── PTChannelManagerDelegate ─────────────────────────────────────────────────

#ifdef PTTM_HAS_FRAMEWORK

- (void)channelManager:(PTChannelManager *)channelManager
    didJoinChannelWithUUID:(NSUUID *)channelUUID
                    reason:(PTChannelJoinReason)reason API_AVAILABLE(ios(16.0))
{
    _isChannelJoined = YES;
    // Fires for restoration reason too — on cold launch after a crash, iOS
    // rejoins the channel on our behalf. Make sure our cached UUID matches
    // what the framework restored, otherwise subsequent transmit calls use
    // the wrong UUID and silently no-op.
    if (!_channelUUID) _channelUUID = channelUUID;
    [self emit:@"onPTTChannelJoined" body:@{@"channelId": channelUUID.UUIDString}];
}

- (void)channelManager:(PTChannelManager *)channelManager
    didLeaveChannelWithUUID:(NSUUID *)channelUUID
                     reason:(PTChannelLeaveReason)reason API_AVAILABLE(ios(16.0))
{
    // Stop-push leave: the server sent a pushtotalk push with no activeSpeaker,
    // so incomingPushResultForChannelManager returned leaveChannelPushResult to
    // avoid the nil-participant crash. Silently rejoin without notifying JS —
    // the leave/rejoin is an implementation detail the UI does not need to see.
    if (_isLeaveFromStopPush) {
        _isLeaveFromStopPush = NO;
        if (_channelManager && _channelUUID && _channelDescriptor) {
            @try {
                [_channelManager requestJoinChannelWithUUID:_channelUUID
                                                 descriptor:_channelDescriptor];
            } @catch (NSException *ex) {
                _isChannelJoined = NO;
                [self emit:@"onPTTChannelLeft" body:@{@"channelId": channelUUID.UUIDString}];
            }
        } else {
            _isChannelJoined = NO;
            [self emit:@"onPTTChannelLeft" body:@{@"channelId": channelUUID.UUIDString}];
        }
        return;
    }

    BOOL wasIntentional = _isLeavingIntentionally;
    _isLeavingIntentionally = NO;

    // App-initiated leave (the user pressed Leave or we tore the session down).
    if (wasIntentional) {
        _isChannelJoined = NO;
        _channelUUID     = nil;
        [self emit:@"onPTTChannelLeft" body:@{@"channelId": channelUUID.UUIDString}];
        return;
    }

    // System-initiated leave from outside the app (Dynamic Island / lock-screen
    // Leave button). Treat as intentional from the framework's perspective.
    if (reason == PTChannelLeaveReasonUserRequest) {
        _isChannelJoined = NO;
        _channelUUID     = nil;
        [self emit:@"onPTTChannelLeft" body:@{@"channelId": channelUUID.UUIDString}];
        return;
    }

    // Stale leave for a UUID that's no longer our active channel. With fresh
    // per-join UUIDs (see initialize:), this is the case for every deferred
    // didLeaveChannelWithUUID iOS queues during initialize() — the leaving
    // UUID belongs to a previous session, our current session uses a
    // different UUID. Just emit so JS knows about it (some flows still want
    // to consume the event), but DO NOT try to rejoin: rejoining via
    // requestJoinChannelWithUUID:_channelUUID would issue a duplicate join
    // for the already-joined NEW UUID, which iOS treats as a contract
    // violation and silently breaks subsequent transmissions.
    if (!_channelUUID || ![channelUUID isEqual:_channelUUID]) {
        NSLog(@"[PTT] Ignoring stale didLeaveChannelWithUUID for previous-session UUID %@ (active=%@)",
              channelUUID.UUIDString, _channelUUID.UUIDString ?: @"<nil>");
        [self emit:@"onPTTChannelLeft" body:@{@"channelId": channelUUID.UUIDString}];
        return;
    }

    // The framework left our CURRENT channel for a non-user reason
    // (PTChannelLeaveReasonSystemPolicy, PTChannelLeaveReasonUnknown, or
    // anything else added in future iOS versions). Try to recover by
    // re-issuing requestJoinChannelWithUUID with the same UUID. If it
    // raises, fall back to telling JS so the UI can reset.
    NSLog(@"[PTT] Active channel left (reason=%ld), attempting self-heal rejoin",
          (long)reason);
    if (_channelManager && _channelUUID && _channelDescriptor) {
        @try {
            [_channelManager requestJoinChannelWithUUID:_channelUUID
                                             descriptor:_channelDescriptor];
        } @catch (NSException *ex) {
            _isChannelJoined = NO;
            [self emit:@"onPTTChannelLeft" body:@{@"channelId": channelUUID.UUIDString}];
        }
    } else {
        _isChannelJoined = NO;
        [self emit:@"onPTTChannelLeft" body:@{@"channelId": channelUUID.UUIDString}];
    }
}

- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    didBeginTransmittingFromSource:(PTChannelTransmitRequestSource)source API_AVAILABLE(ios(16.0))
{
    _isTransmitting = YES;
    [self emit:@"onPTTTransmitStart" body:@{@"channelId": channelUUID.UUIDString}];
}

- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    didEndTransmittingFromSource:(PTChannelTransmitRequestSource)source API_AVAILABLE(ios(16.0))
{
    _isTransmitting = NO;
    [self emit:@"onPTTTransmitStop" body:@{@"channelId": channelUUID.UUIDString}];
}

- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    receivedEphemeralPushToken:(NSData *)pushToken API_AVAILABLE(ios(16.0))
{
    [self _emitPushToken:pushToken channelUUID:channelUUID];
}

// iOS 26 removed the channelUUID parameter from this delegate callback.
// Both selectors must be implemented so the app survives on iOS 16-25 and iOS 26+.
- (void)channelManager:(PTChannelManager *)channelManager
    receivedEphemeralPushToken:(NSData *)pushToken API_AVAILABLE(ios(16.0))
{
    [self _emitPushToken:pushToken channelUUID:_channelUUID];
}

- (void)_emitPushToken:(NSData *)pushToken channelUUID:(NSUUID *)channelUUID API_AVAILABLE(ios(16.0))
{
    NSMutableString *hex = [NSMutableString stringWithCapacity:pushToken.length * 2];
    const unsigned char *b = (const unsigned char *)pushToken.bytes;
    for (NSUInteger i = 0; i < pushToken.length; i++) [hex appendFormat:@"%02x", b[i]];
    [self emit:@"onPTTPushToken" body:@{
        @"channelId": channelUUID.UUIDString ?: @"",
        @"token": hex,
    }];
}

- (PTPushResult *)incomingPushResultForChannelManager:(PTChannelManager *)channelManager
                                          channelUUID:(NSUUID *)channelUUID
                                          pushPayload:(NSDictionary *)pushPayload API_AVAILABLE(ios(16.0))
{
    NSString *sender = pushPayload[@"activeSpeaker"] ?: pushPayload[@"senderName"];
    // A "stop" push has no activeSpeaker. We cannot pass nil to
    // pushResultForActiveRemoteParticipant: — Apple throws NSException at line 34
    // of PTPushResult.m (confirmed in TestFlight crash EXC_CRASH/SIGABRT).
    // leaveChannelPushResult satisfies the non-nil requirement; the flag below
    // lets didLeaveChannelWithUUID perform a silent self-heal rejoin without
    // emitting onPTTChannelLeft to the JS layer.
    if (!sender) {
        _isLeaveFromStopPush = YES;
        return [PTPushResult leaveChannelPushResult];
    }

    // Half-duplex collision: if the local user is currently transmitting and a
    // remote PTT push arrives, Apple requires us to stop the local transmission
    // BEFORE returning an active remote participant — otherwise the framework
    // raises an error. The system batches stop-transmit + activate-remote-
    // participant together without deactivating the audio session, so the
    // remote audio plays back without a stale gap.
    if (_isTransmitting && _channelManager && _channelUUID) {
        [_channelManager stopTransmittingWithChannelUUID:_channelUUID];
        _isTransmitting = NO;
    }

    PTParticipant *participant = [[PTParticipant alloc] initWithName:sender image:nil];
    return [PTPushResult pushResultForActiveRemoteParticipant:participant];
}

- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    activeRemoteParticipantDidChange:(PTParticipant *)participant API_AVAILABLE(ios(16.0))
{
    if (participant) {
        [self emit:@"onPTTReceiveStart" body:@{
            @"channelId": channelUUID.UUIDString,
            @"participantName": participant.name ?: [NSNull null],
        }];
    } else {
        [self emit:@"onPTTReceiveStop" body:@{@"channelId": channelUUID.UUIDString}];
    }
}

- (void)channelManager:(PTChannelManager *)channelManager
    failedToJoinChannelWithUUID:(NSUUID *)channelUUID
                          error:(NSError *)error API_AVAILABLE(ios(16.0))
{
    _isChannelJoined = NO;
    [self emit:@"onPTTError" body:@{
        @"channelId": channelUUID.UUIDString,
        @"error": error.localizedDescription,
    }];
}

- (void)channelManager:(PTChannelManager *)channelManager
    failedToLeaveChannelWithUUID:(NSUUID *)channelUUID
                           error:(NSError *)error API_AVAILABLE(ios(16.0))
{
    [self emit:@"onPTTError" body:@{
        @"channelId": channelUUID.UUIDString,
        @"error": error.localizedDescription,
    }];
}

- (void)channelManager:(PTChannelManager *)channelManager
    failedToBeginTransmittingInChannelWithUUID:(NSUUID *)channelUUID
                                         error:(NSError *)error API_AVAILABLE(ios(16.0))
{
    [self emit:@"onPTTError" body:@{
        @"channelId": channelUUID.UUIDString,
        @"error": error.localizedDescription,
    }];
}

- (void)channelManager:(PTChannelManager *)channelManager
    failedToStopTransmittingInChannelWithUUID:(NSUUID *)channelUUID
                                        error:(NSError *)error API_AVAILABLE(ios(16.0))
{
    [self emit:@"onPTTError" body:@{
        @"channelId": channelUUID.UUIDString,
        @"error": error.localizedDescription,
    }];
}

- (void)channelManager:(PTChannelManager *)channelManager
    didActivateAudioSession:(AVAudioSession *)audioSession API_AVAILABLE(ios(16.0))
{
    // The framework just activated AVAudioSession for this transmission
    // (outgoing or incoming). Hand the session to WebRTC and explicitly turn
    // on audio capture/playback — required because we configured manual audio
    // mode at channel-manager init.
#ifdef PTTM_HAS_WEBRTC
    RTCAudioSession *rtcSession = [RTCAudioSession sharedInstance];
    [rtcSession audioSessionDidActivate:audioSession];
    rtcSession.isAudioEnabled = YES;
#endif
    [self emit:@"onPTTAudioActivated" body:@{
        @"channelId": _channelUUID.UUIDString ?: @"",
    }];
}

- (void)channelManager:(PTChannelManager *)channelManager
    didDeactivateAudioSession:(AVAudioSession *)audioSession API_AVAILABLE(ios(16.0))
{
    // Disable WebRTC audio FIRST so it stops touching the session, then notify
    // it the session is gone. Reversing this order lets WebRTC briefly try to
    // run audio against a deactivated session and has been observed to log
    // RTCAudioSession errors in production.
#ifdef PTTM_HAS_WEBRTC
    RTCAudioSession *rtcSession = [RTCAudioSession sharedInstance];
    rtcSession.isAudioEnabled = NO;
    [rtcSession audioSessionDidDeactivate:audioSession];
#endif
    [self emit:@"onPTTAudioDeactivated" body:@{
        @"channelId": _channelUUID.UUIDString ?: @"",
    }];
}

// ─── AVAudioSession interruption + route-change observers ───────────────────
// Apple's "Reduce network latency and handle audio interruptions" doc
// section explicitly tells PTT apps to monitor and respond to AVAudioSession
// notifications. The PT framework already handles "can't transmit during a
// cellular call" by firing failedToBeginTransmittingInChannelWithUUID, but
// out-of-band interruptions and route changes (AirPods unplugged, etc.) need
// to be at least visible in logs so we can diagnose user reports.

- (void)_registerAudioInterruptionObservers
{
    if (_audioObserversRegistered) return;
    _audioObserversRegistered = YES;
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    [nc addObserver:self
           selector:@selector(_handleAudioInterruption:)
               name:AVAudioSessionInterruptionNotification
             object:nil];
    [nc addObserver:self
           selector:@selector(_handleRouteChange:)
               name:AVAudioSessionRouteChangeNotification
             object:nil];
}

- (void)_handleAudioInterruption:(NSNotification *)notif
{
    NSNumber *typeNum = notif.userInfo[AVAudioSessionInterruptionTypeKey];
    AVAudioSessionInterruptionType type = (AVAudioSessionInterruptionType)typeNum.unsignedIntegerValue;
    if (type == AVAudioSessionInterruptionTypeBegan) {
        NSLog(@"[PTT] AVAudioSession interruption began (likely incoming call)");
        // The framework will fire failedToBeginTransmittingInChannelWithUUID
        // on its own when this happens mid-press; nothing else to do here.
    } else if (type == AVAudioSessionInterruptionTypeEnded) {
        NSNumber *optsNum = notif.userInfo[AVAudioSessionInterruptionOptionKey];
        BOOL shouldResume = ((AVAudioSessionInterruptionOptions)optsNum.unsignedIntegerValue
                             & AVAudioSessionInterruptionOptionShouldResume) != 0;
        NSLog(@"[PTT] AVAudioSession interruption ended (shouldResume=%d)", shouldResume);
    }
}

- (void)_handleRouteChange:(NSNotification *)notif
{
    NSNumber *reasonNum = notif.userInfo[AVAudioSessionRouteChangeReasonKey];
    AVAudioSessionRouteChangeReason reason = (AVAudioSessionRouteChangeReason)reasonNum.unsignedIntegerValue;
    NSLog(@"[PTT] AVAudioSession route change reason=%lu", (unsigned long)reason);
    // No action needed — AVAudioSession reroutes audio automatically. WebRTC
    // picks up the new route on the next captured frame.
}

- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

// ─── PTChannelRestorationDelegate ────────────────────────────────────────────

- (PTChannelDescriptor *)channelDescriptorForRestoredChannelUUID:(NSUUID *)channelUUID API_AVAILABLE(ios(16.0))
{
    // Return the cached descriptor when UUIDs match; otherwise a placeholder
    // so the system can restore the channel after a relaunch or device reboot.
    if (_channelDescriptor && [channelUUID isEqual:_channelUUID]) {
        return _channelDescriptor;
    }
    return [[PTChannelDescriptor alloc] initWithName:@"GatherSafe PTT" image:nil];
}

#endif // PTTM_HAS_FRAMEWORK

@end
