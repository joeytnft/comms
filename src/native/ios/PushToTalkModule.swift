import Foundation
import React

// PushToTalk.framework is weak-linked (iOS 16+). On iPhoneOS26.0.sdk, Apple
// removed the Swift type definitions while leaving the binary present, so
// canImport(PushToTalk) evaluates true but all PTT* types are absent.
// Neither canImport nor hasSymbol (unsupported in the iOS 26 toolchain) can
// guard against this at compile time. This module is therefore a compile-safe
// stub; the app falls back to LiveKit-based PTT when native PTT is unavailable.

@objc(PushToTalkModule)
class PushToTalkModule: RCTEventEmitter {

  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool { return false }

  override func supportedEvents() -> [String] {
    return [
      "onPTTChannelJoined",
      "onPTTChannelLeft",
      "onPTTTransmitStart",
      "onPTTTransmitStop",
      "onPTTReceiveStart",
      "onPTTReceiveStop",
      "onPTTPushToken",
      "onPTTError",
    ]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  @objc func initialize(_ channelId: String,
                        channelName: String,
                        resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter("UNSUPPORTED", "Push To Talk native framework not available on this platform", nil)
  }

  @objc func startTransmitting(_ channelId: String,
                                resolver: @escaping RCTPromiseResolveBlock,
                                rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter("UNSUPPORTED", "Push To Talk native framework not available on this platform", nil)
  }

  @objc func stopTransmitting(_ channelId: String,
                               resolver: @escaping RCTPromiseResolveBlock,
                               rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter("UNSUPPORTED", "Push To Talk native framework not available on this platform", nil)
  }

  @objc func leaveChannel(_ channelId: String,
                           resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter("UNSUPPORTED", "Push To Talk native framework not available on this platform", nil)
  }
}
