#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// RCT_EXTERN_MODULE / RCT_EXTERN_METHOD rely on RCTRegisterModule, which is
// compiled out when the New Architecture is enabled. Guard accordingly so this
// file is a no-op in New Arch builds (the Swift @objc class self-registers).
#if !RCT_NEW_ARCH_ENABLED
RCT_EXTERN_MODULE(PushToTalkModule, RCTEventEmitter)

RCT_EXTERN_METHOD(initialize:(NSString *)channelId
                  channelName:(NSString *)channelName
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(startTransmitting:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(stopTransmitting:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(leaveChannel:(NSString *)channelId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)
#endif
