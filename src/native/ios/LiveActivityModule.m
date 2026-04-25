/**
 * LiveActivityModule — ObjC extern bridge for the Swift LiveActivityModule.
 *
 * Declares all JS-facing methods so the React Native bridge can find them.
 * The actual implementations live in LiveActivityModule.swift.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

/// Start a new Live Activity for a PTT session.
/// Resolves with the opaque activity ID string needed for subsequent calls.
RCT_EXTERN_METHOD(startActivity:(NSString *)channelName
                  orgName:(NSString *)orgName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

/// Update the dynamic content of a running Live Activity.
/// speakerName and alertLevel may be null/nil when nobody is speaking or no alert.
RCT_EXTERN_METHOD(updateActivity:(NSString *)activityId
                  channelName:(NSString *)channelName
                  speakerName:(NSString *)speakerName
                  lastSpeakerName:(NSString *)lastSpeakerName
                  isTransmitting:(BOOL)isTransmitting
                  memberCount:(nonnull NSNumber *)memberCount
                  alertLevel:(NSString *)alertLevel
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

/// End the Live Activity immediately and remove it from Dynamic Island / Lock Screen.
RCT_EXTERN_METHOD(endActivity:(NSString *)activityId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
