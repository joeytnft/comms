import Foundation
import ActivityKit

/// React Native native module that controls GatherSafe Live Activities from JS.
/// Requires iOS 16.2+ — all methods are no-ops (resolve immediately) on older OS.
@objc(LiveActivityModule)
class LiveActivityModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // ── startActivity ─────────────────────────────────────────────────────────

    @objc func startActivity(
        _ channelName: String,
        orgName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }
        let activitiesEnabled: Bool
        if #available(iOS 17.0, *) {
            activitiesEnabled = Activity<GatherSafeActivityAttributes>.authorizationInfo.areActivitiesEnabled
        } else {
            activitiesEnabled = ActivityAuthorizationInfo().areActivitiesEnabled
        }
        guard activitiesEnabled else {
            reject("ACTIVITIES_DISABLED", "Live Activities are disabled on this device", nil)
            return
        }

        let attrs = GatherSafeActivityAttributes(orgName: orgName)
        let state = GatherSafeActivityAttributes.ContentState(
            channelName: channelName,
            speakerName: nil,
            isTransmitting: false,
            memberCount: 0,
            alertLevel: nil
        )

        do {
            let activity = try Activity<GatherSafeActivityAttributes>.request(
                attributes: attrs,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            resolve(activity.id)
        } catch {
            reject("START_FAILED", error.localizedDescription, error)
        }
    }

    // ── updateActivity ────────────────────────────────────────────────────────

    @objc func updateActivity(
        _ activityId: String,
        channelName: String,
        speakerName: String?,
        isTransmitting: Bool,
        memberCount: NSNumber,
        alertLevel: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }

        let newState = GatherSafeActivityAttributes.ContentState(
            channelName: channelName,
            speakerName: speakerName?.isEmpty == false ? speakerName : nil,
            isTransmitting: isTransmitting,
            memberCount: memberCount.intValue,
            alertLevel: alertLevel?.isEmpty == false ? alertLevel : nil
        )
        let content = ActivityContent(state: newState, staleDate: nil)

        Task {
            for activity in Activity<GatherSafeActivityAttributes>.activities
                where activity.id == activityId {
                    await activity.update(content)
            }
            resolve(nil)
        }
    }

    // ── endActivity ───────────────────────────────────────────────────────────

    @objc func endActivity(
        _ activityId: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }

        Task {
            for activity in Activity<GatherSafeActivityAttributes>.activities
                where activity.id == activityId {
                    await activity.end(nil, dismissalPolicy: .immediate)
            }
            resolve(nil)
        }
    }
}
