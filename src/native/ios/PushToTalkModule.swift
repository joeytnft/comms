import Foundation
import PushToTalk
import React

// iOS 16+ PTT delegate — kept in a separate class so the RN module
// itself remains loadable on iOS 15 (framework is weak-linked).
@available(iOS 16.0, *)
private class PTTChannelHandler: NSObject, PTTChannelManagerDelegate {
  weak var emitter: PushToTalkModule?
  var channelManager: PTTChannelManager?

  init(emitter: PushToTalkModule) {
    self.emitter = emitter
  }

  // MARK: - PTTChannelManagerDelegate

  func channelManager(_ channelManager: PTTChannelManager,
                      didJoinChannel channelId: String,
                      with reason: PTTChannelJoinReason) {
    emitter?.sendEvent(withName: "onPTTChannelJoined", body: ["channelId": channelId])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      didLeaveChannel channelId: String,
                      with reason: PTTChannelLeaveReason) {
    emitter?.sendEvent(withName: "onPTTChannelLeft", body: ["channelId": channelId])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      channelId: String,
                      didBeginTransmittingFrom source: PTTTransmitRequestSource) {
    emitter?.sendEvent(withName: "onPTTTransmitStart", body: ["channelId": channelId])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      channelId: String,
                      didEndTransmittingFrom source: PTTTransmitRequestSource) {
    emitter?.sendEvent(withName: "onPTTTransmitStop", body: ["channelId": channelId])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      channelId: String,
                      receivedEphemeralPushToken pushToken: Data) {
    let tokenHex = pushToken.map { String(format: "%02x", $0) }.joined()
    emitter?.sendEvent(withName: "onPTTPushToken", body: [
      "channelId": channelId,
      "token": tokenHex
    ])
  }

  func incomingPushResult(channelManager: PTTChannelManager,
                          channelId: String,
                          pushPayload: [String: Any]) -> PTTPushResult {
    guard let senderName = pushPayload["senderName"] as? String else {
      return .leaveChannel
    }
    let participant = PTTActiveRemoteParticipant(name: senderName, image: nil)
    return .activeRemoteParticipant(participant)
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      channelId: String,
                      activeRemoteParticipantDidChange participant: PTTActiveRemoteParticipant?) {
    if let participant = participant {
      emitter?.sendEvent(withName: "onPTTReceiveStart", body: [
        "channelId": channelId,
        "participantName": participant.name as Any
      ])
    } else {
      emitter?.sendEvent(withName: "onPTTReceiveStop", body: ["channelId": channelId])
    }
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      failedToJoinChannel channelId: String,
                      error: Error) {
    emitter?.sendEvent(withName: "onPTTError", body: [
      "channelId": channelId,
      "error": error.localizedDescription
    ])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      failedToLeaveChannel channelId: String,
                      error: Error) {
    emitter?.sendEvent(withName: "onPTTError", body: [
      "channelId": channelId,
      "error": error.localizedDescription
    ])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      failedToBeginTransmittingInChannel channelId: String,
                      error: Error) {
    emitter?.sendEvent(withName: "onPTTError", body: [
      "channelId": channelId,
      "error": error.localizedDescription
    ])
  }

  func channelManager(_ channelManager: PTTChannelManager,
                      failedToStopTransmittingInChannel channelId: String,
                      error: Error) {
    emitter?.sendEvent(withName: "onPTTError", body: [
      "channelId": channelId,
      "error": error.localizedDescription
    ])
  }
}

// MARK: - React Native Module

@objc(PushToTalkModule)
class PushToTalkModule: RCTEventEmitter {

  // Stored as AnyObject so this class compiles cleanly on iOS 15.
  private var pttHandler: AnyObject?
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

  // MARK: - JS-facing Methods

  @objc func initialize(_ channelId: String,
                        channelName: String,
                        resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.0, *) else {
      rejecter("UNSUPPORTED", "Push To Talk requires iOS 16 or later", nil)
      return
    }

    let handler = PTTChannelHandler(emitter: self)
    self.pttHandler = handler

    Task {
      do {
        let manager = try await PTTChannelManager.channelManager(
          delegate: handler,
          restorationDelegate: nil
        )
        handler.channelManager = manager
        let descriptor = PTTChannelDescriptor(name: channelName, image: nil)
        // iOS 17 deprecated the token/serviceType overload; use the simpler API when available.
        if #available(iOS 17.0, *) {
          try await manager.joinChannel(channelId: channelId, descriptor: descriptor)
        } else {
          try await manager.joinChannel(
            channelId: channelId,
            descriptor: descriptor,
            token: nil,
            serviceType: .channelService
          )
        }
        resolver(nil)
      } catch {
        rejecter("PTT_INIT_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc func startTransmitting(_ channelId: String,
                                resolver: @escaping RCTPromiseResolveBlock,
                                rejecter: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.0, *),
          let handler = pttHandler as? PTTChannelHandler,
          let manager = handler.channelManager else {
      rejecter("PTT_NOT_INITIALIZED", "PTT channel not initialized", nil)
      return
    }
    Task {
      do {
        try await manager.requestBeginTransmitting(channelId: channelId)
        resolver(nil)
      } catch {
        rejecter("PTT_TRANSMIT_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc func stopTransmitting(_ channelId: String,
                               resolver: @escaping RCTPromiseResolveBlock,
                               rejecter: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.0, *),
          let handler = pttHandler as? PTTChannelHandler,
          let manager = handler.channelManager else {
      rejecter("PTT_NOT_INITIALIZED", "PTT channel not initialized", nil)
      return
    }
    Task {
      do {
        try await manager.stopTransmitting(channelId: channelId)
        resolver(nil)
      } catch {
        rejecter("PTT_STOP_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc func leaveChannel(_ channelId: String,
                           resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.0, *),
          let handler = pttHandler as? PTTChannelHandler,
          let manager = handler.channelManager else {
      rejecter("PTT_NOT_INITIALIZED", "PTT channel not initialized", nil)
      return
    }
    Task {
      do {
        try await manager.leaveChannel(channelId: channelId)
        self.pttHandler = nil
        resolver(nil)
      } catch {
        rejecter("PTT_LEAVE_ERROR", error.localizedDescription, error)
      }
    }
  }
}
