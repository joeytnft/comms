#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Import PushToTalk ObjC headers when present in the SDK.
// __has_include checks the .h file — not the Swift module overlay — so this
// evaluates correctly on iPhoneOS26.0.sdk where Apple removed the overlay but
// kept the framework binary and headers.
#if __has_include(<PushToTalk/PushToTalk.h>)
#import <PushToTalk/PushToTalk.h>
#import <AVFoundation/AVFoundation.h>
#define PTTM_HAS_FRAMEWORK 1
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
#endif
    BOOL _hasListeners;
}

RCT_EXPORT_MODULE(PushToTalkModule)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (NSArray<NSString *> *)supportedEvents {
    return @[
        @"onPTTChannelJoined", @"onPTTChannelLeft",
        @"onPTTTransmitStart", @"onPTTTransmitStop",
        @"onPTTReceiveStart",  @"onPTTReceiveStop",
        @"onPTTPushToken",     @"onPTTError",
    ];
}

- (void)startObserving { _hasListeners = YES; }
- (void)stopObserving  { _hasListeners = NO;  }

- (void)emit:(NSString *)name body:(id)body {
    if (_hasListeners) [self sendEventWithName:name body:body];
}

// ─── JS-facing methods ────────────────────────────────────────────────────────

RCT_EXPORT_METHOD(initialize:(NSString *)channelId
                  channelName:(NSString *)channelName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#ifdef PTTM_HAS_FRAMEWORK
    if (@available(iOS 16.0, *)) {
        _channelUUID       = [[NSUUID alloc] initWithUUIDString:channelId] ?: [NSUUID UUID];
        _channelDescriptor = [[PTChannelDescriptor alloc] initWithName:channelName image:nil];
        __weak typeof(self) weak = self;
        [PTChannelManager channelManagerWithDelegate:self
                                restorationDelegate:self
                                  completionHandler:^(PTChannelManager *mgr, NSError *err) {
            if (err) { reject(@"PTT_INIT_ERROR", err.localizedDescription, err); return; }
            weak->_channelManager = mgr;
            [mgr requestJoinChannelWithUUID:weak->_channelUUID
                                 descriptor:weak->_channelDescriptor];
            resolve(nil);
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
        _channelManager = nil;
        _channelUUID    = nil;
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
    [self emit:@"onPTTChannelJoined" body:@{@"channelId": channelUUID.UUIDString}];
}

- (void)channelManager:(PTChannelManager *)channelManager
    didLeaveChannelWithUUID:(NSUUID *)channelUUID
                     reason:(PTChannelLeaveReason)reason API_AVAILABLE(ios(16.0))
{
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
    NSMutableString *hex = [NSMutableString stringWithCapacity:pushToken.length * 2];
    const unsigned char *b = (const unsigned char *)pushToken.bytes;
    for (NSUInteger i = 0; i < pushToken.length; i++) [hex appendFormat:@"%02x", b[i]];
    [self emit:@"onPTTPushToken" body:@{
        @"channelId": channelUUID.UUIDString,
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
    // The PTT framework activated the audio session. Begin recording or
    // playback via the app's audio layer (LiveKit/WebRTC) here.
    // The framework manages audio session priority — do not activate it manually.
}

- (void)channelManager:(PTChannelManager *)channelManager
    didDeactivateAudioSession:(AVAudioSession *)audioSession API_AVAILABLE(ios(16.0))
{
    // Audio session deactivated — stop recording or playback.
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
