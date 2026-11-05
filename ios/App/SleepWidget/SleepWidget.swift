import ActivityKit
import SwiftUI
import WidgetKit

@main
struct SleepWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SleepAttributes.self) { context in
            HStack(spacing: 14) {
                Image(systemName: "moon.zzz.fill")
                    .font(.title)
                    .foregroundStyle(.purple)
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(context.attributes.babyName) 수면 중").font(.headline)
                    Text("우리 가족").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(context.state.startedAt, style: .timer)
                    .font(.title2.monospacedDigit()).bold()
            }
            .padding(18)
            .activityBackgroundTint(Color(red: 0.95, green: 0.92, blue: 0.99))
            .activitySystemActionForegroundColor(.purple)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("수면 중", systemImage: "moon.zzz.fill").foregroundStyle(.purple)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.startedAt, style: .timer).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(context.attributes.babyName) · 우리 가족").font(.caption)
                }
            } compactLeading: {
                Image(systemName: "moon.zzz.fill").foregroundStyle(.purple)
            } compactTrailing: {
                Text(context.state.startedAt, style: .timer).monospacedDigit().frame(width: 65)
            } minimal: {
                Image(systemName: "moon.zzz.fill").foregroundStyle(.purple)
            }
        }
    }
}
