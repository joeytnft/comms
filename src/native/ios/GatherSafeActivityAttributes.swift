import ActivityKit
import Foundation

/// Shared ActivityAttributes struct used by both the main app (to start/update/end
/// the activity via ActivityKit) and the GatherSafeWidget extension (to render it).
///
/// IMPORTANT: this file is added to BOTH targets by the withLiveActivity config plugin.
/// Keep the struct definition identical in both targets — ActivityKit matches them by
/// module + type name, so a mismatch between app and widget silently breaks updates.
@available(iOS 16.2, *)
public struct GatherSafeActivityAttributes: ActivityAttributes {

    // ── Static content (set at activity start, never changes) ────────────────
    public var orgName: String

    // ── Dynamic content (updated as PTT state changes) ───────────────────────
    public struct ContentState: Codable, Hashable {
        /// Name of the PTT channel/group the user is in.
        public var channelName: String

        /// Display name of whoever is currently speaking.
        /// nil → nobody is transmitting.
        public var speakerName: String?

        /// true when the LOCAL user is the one transmitting.
        public var isTransmitting: Bool

        /// Number of team members connected to the channel.
        public var memberCount: Int

        /// Active org-wide alert level: "attention" | "warning" | "emergency" | nil
        public var alertLevel: String?
    }
}
