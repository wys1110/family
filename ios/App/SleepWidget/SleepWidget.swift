import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

@main
struct SleepWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SleepAttributes.self) { context in
            VStack(spacing: 16) {
                HStack(spacing: 14) {
                    Image(systemName: "moon.zzz.fill")
                        .font(.title)
                        .foregroundStyle(.purple)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(context.attributes.babyName) \(context.state.endedAt == nil ? "수면 중" : "수면 종료")").font(.headline).lineLimit(1)
                        Text("우리 가족").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    SleepElapsedTime(state: context.state)
                        .font(.title2.monospacedDigit()).bold()
                        .layoutPriority(1)
                }
                SleepElapsedBar(state: context.state)
            }
            .padding(18)
            .activityBackgroundTint(Color(red: 0.95, green: 0.92, blue: 0.99))
            .activitySystemActionForegroundColor(.purple)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.endedAt == nil ? "수면 중" : "수면 종료", systemImage: "moon.zzz.fill").foregroundStyle(.purple)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SleepElapsedTime(state: context.state).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(context.attributes.babyName) · 우리 가족").font(.caption).lineLimit(1)
                        SleepElapsedBar(state: context.state)
                    }
                }
            } compactLeading: {
                Image(systemName: "moon.zzz.fill").foregroundStyle(.purple)
            } compactTrailing: {
                SleepElapsedTime(state: context.state)
                    .font(.caption.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.8).frame(width: 65)
            } minimal: {
                Image(systemName: "moon.zzz.fill").foregroundStyle(.purple)
            }
        }
    }
}

private struct SleepElapsedTime: View {
    let state: SleepAttributes.ContentState

    var body: some View {
        if let endedAt = state.endedAt {
            let seconds = Int(max(0, endedAt.timeIntervalSince(state.startedAt)))
            let duration = String(format: "%d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
            Text(duration).accessibilityLabel("수면 종료, 경과 시간 \(duration)")
        } else {
            Text(state.startedAt, style: .timer)
                .accessibilityLabel(Text("수면 경과 시간 ") + Text(state.startedAt, style: .timer))
        }
    }
}

private struct SleepElapsedBar: View {
    let state: SleepAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("수면 경과 · 1칸 = 1시간").font(.caption).foregroundStyle(.secondary)
            // Fixed date intervals let iOS advance each hour even while the app is suspended.
            // This is an elapsed-time scale, not a sleep goal or automatic end time.
            HStack(spacing: 6) {
                ForEach(0..<8) { hour in
                    let start = state.startedAt.addingTimeInterval(Double(hour) * 3600)
                    if let endedAt = state.endedAt {
                        ProgressView(value: min(3600, max(0, endedAt.timeIntervalSince(start))), total: 3600)
                    } else {
                        ProgressView(timerInterval: start...start.addingTimeInterval(3600), countsDown: false) {
                            EmptyView()
                        } currentValueLabel: {
                            EmptyView()
                        }
                    }
                }
            }
            .tint(.purple)
            .accessibilityHidden(true)
            HStack {
                Text("0")
                Spacer()
                Text("2")
                Spacer()
                Text("4")
                Spacer()
                Text("6")
                Spacer()
                Text("8시간")
            }
            .font(.caption2).foregroundStyle(.secondary)
            .accessibilityHidden(true)
        }
    }
}
