import SwiftUI
import WidgetKit

@main
struct GatherSafeWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.2, *) {
            GatherSafeLiveActivity()
        }
    }
}
