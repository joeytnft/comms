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

RCT_EXPORT_METHOD(initialize:(NSString *)channelId
                  channelName:(NSString *)channelName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        NSUUID *targetUUID = [PushToTalkModule channelUUIDForID:channelId];
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
    _isChannelJoined = NO;
    _channelUUID = nil;
    [self emit:@"onPTTChannelLeft" body:@{@"channelId": channelUUID.UUIDString}];
}

- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    didBeginTransmittingFromSource:(PTChannelTransmitRequestSource)source API_AVAILABLE(ios(16.0))
{
    [self emit:@"onPTTTransmitStart" body:@{@"channelId": channelUUID.UUIDString}];
}

- (void)channelManager:(PTChannelManager *)channelManager
           channelUUID:(NSUUID *)channelUUID
    didEndTransmittingFromSource:(PTChannelTransmitRequestSource)source API_AVAILABLE(ios(16.0))
{
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
    NSString *sender = pushPayload[@"senderName"];
    if (!sender) return [PTPushResult leaveChannelPushResult];
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
