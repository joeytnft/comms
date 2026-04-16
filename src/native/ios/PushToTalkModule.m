#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

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
