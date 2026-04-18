import ActivityKit
import SwiftUI
import WidgetKit

// ── Colours matching the GatherSafe dark theme ────────────────────────────────

private extension Color {
    static let gsBackground  = Color(red: 0.10, green: 0.10, blue: 0.14) // #1a1a24
    static let gsAccent      = Color(red: 0.22, green: 0.53, blue: 0.98) // #389afa
    static let gsSuccess     = Color(red: 0.18, green: 0.78, blue: 0.45) // #2ec872
    static let gsDanger      = Color(red: 0.95, green: 0.27, blue: 0.27) // #f24545
    static let gsWarning     = Color(red: 1.00, green: 0.70, blue: 0.00) // #FFB300
    static let gsAttention   = Color(red: 1.00, green: 0.60, blue: 0.00) // #FF9900
}

// ── Alert colour helper ───────────────────────────────────────────────────────

private func alertColor(_ level: String?) -> Color {
    switch level {
    case "emergency": return .gsDanger
    case "warning":   return .gsWarning
    case "attention": return .gsAttention
    default:          return .clear
    }
}

private func alertLabel(_ level: String?) -> String {
    switch level {
    case "emergency": return "EMERGENCY"
    case "warning":   return "WARNING"
    case "attention": return "ATTENTION"
    default:          return ""
    }
}

// ── Mic icon coloured by PTT state ────────────────────────────────────────────

@available(iOS 16.2, *)
private func micColor(state: GatherSafeActivityAttributes.ContentState) -> Color {
    if state.isTransmitting       { return .gsSuccess }
    if state.speakerName != nil   { return .gsAccent  }
    return Color(.systemGray3)
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – Widget views
// ─────────────────────────────────────────────────────────────────────────────

/// Compact leading — mic icon, coloured by state.
@available(iOS 16.2, *)
struct CompactLeadingView: View {
    let state: GatherSafeActivityAttributes.ContentState

    var body: some View {
        Image(systemName: state.isTransmitting ? "mic.fill" : "mic")
            .foregroundStyle(micColor(state: state))
            .font(.system(size: 14, weight: .semibold))
    }
}

/// Compact trailing — channel name, truncated.
struct CompactTrailingView: View {
    let channelName: String
    let alertLevel: String?

    var body: some View {
        HStack(spacing: 4) {
            if let level = alertLevel, !level.isEmpty {
                Circle()
                    .fill(alertColor(level))
                    .frame(width: 7, height: 7)
            }
            Text(channelName)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
        }
    }
}

/// Minimal — just the mic icon.
@available(iOS 16.2, *)
struct MinimalView: View {
    let state: GatherSafeActivityAttributes.ContentState

    var body: some View {
        Image(systemName: "mic.fill")
            .foregroundStyle(micColor(state: state))
            .font(.system(size: 12, weight: .semibold))
    }
}

/// Expanded — full lock-screen / StandBy card.
@available(iOS 16.2, *)
struct ExpandedView: View {
    let attributes: GatherSafeActivityAttributes
    let state: GatherSafeActivityAttributes.ContentState

    private var speakerText: String {
        if state.isTransmitting   { return "You are speaking" }
        if let name = state.speakerName { return "\(name) is speaking" }
        return "Channel active"
    }

    var body: some View {
        HStack(spacing: 12) {
            // Mic circle
            ZStack {
                Circle()
                    .fill(micColor(state: state).opacity(0.18))
                    .frame(width: 44, height: 44)
                Image(systemName: state.isTransmitting ? "mic.fill" : "mic")
                    .foregroundStyle(micColor(state: state))
                    .font(.system(size: 20, weight: .semibold))
            }

            // Text column
            VStack(alignment: .leading, spacing: 2) {
                Text(attributes.orgName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Text(state.channelName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(speakerText)
                    .font(.caption)
                    .foregroundStyle(micColor(state: state))
                    .lineLimit(1)
            }

            Spacer()

            // Right column: member count + alert badge
            VStack(alignment: .trailing, spacing: 4) {
                HStack(spacing: 3) {
                    Image(systemName: "person.2.fill")
                        .font(.caption2)
                    Text("\(state.memberCount)")
                        .font(.caption2.monospacedDigit())
                }
                .foregroundStyle(.secondary)

                if let level = state.alertLevel, !level.isEmpty {
                    Text(alertLabel(level))
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(alertColor(level))
                        .clipShape(Capsule())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – Live Activity widget
// ─────────────────────────────────────────────────────────────────────────────

@available(iOS 16.2, *)
struct GatherSafeLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GatherSafeActivityAttributes.self) { context in
            // Lock screen / StandBy
            ExpandedView(attributes: context.attributes, state: context.state)
                .background(Color.gsBackground)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded Dynamic Island (press & hold)
                DynamicIslandExpandedRegion(.leading) {
                    CompactLeadingView(state: context.state)
                        .padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CompactTrailingView(
                        channelName: context.attributes.orgName,
                        alertLevel: context.state.alertLevel
                    )
                    .padding(.trailing, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedView(attributes: context.attributes, state: context.state)
                }
            } compactLeading: {
                CompactLeadingView(state: context.state)
            } compactTrailing: {
                CompactTrailingView(
                    channelName: context.state.channelName,
                    alertLevel: context.state.alertLevel
                )
            } minimal: {
                MinimalView(state: context.state)
            }
            .widgetURL(URL(string: "gathersafe://ptt"))
            .keylineTint(micColor(state: context.state))
        }
    }
}
