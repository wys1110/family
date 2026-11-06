import ActivityKit
import Capacitor
import UIKit

@objc(SleepLiveActivityPlugin)
public class SleepLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SleepLiveActivityPlugin"
    public let jsName = "SleepLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)]

    @objc func sync(_ call: CAPPluginCall) {
        let sessionId = call.getString("sessionId")
        let babyName = String((call.getString("babyName") ?? "아기").prefix(40))
        let milliseconds = call.getDouble("startedAt")
        let endedMilliseconds = call.getDouble("endedAt")
        Task { @MainActor in
            do {
                let now = Date().timeIntervalSince1970 * 1000
                guard let sessionId, let milliseconds,
                      milliseconds.isFinite, milliseconds > 0,
                      milliseconds <= now, now - milliseconds < 86400000,
                      endedMilliseconds.map({ $0.isFinite && $0 >= milliseconds && $0 <= now }) ?? true else {
                    for activity in Activity<SleepAttributes>.activities {
                        await activity.end(nil, dismissalPolicy: .immediate)
                    }
                    call.resolve(["applied": true])
                    return
                }
                let startedAt = Date(timeIntervalSince1970: milliseconds / 1000)
                let endedAt = endedMilliseconds.map { Date(timeIntervalSince1970: $0 / 1000) }
                let content = ActivityContent(
                    state: SleepAttributes.ContentState(startedAt: startedAt, endedAt: endedAt),
                    staleDate: startedAt.addingTimeInterval(8 * 3600)
                )
                var matching: Activity<SleepAttributes>?
                for activity in Activity<SleepAttributes>.activities {
                    if activity.attributes.sessionId == sessionId && activity.attributes.babyName == babyName
                        && activity.activityState != .ended && activity.activityState != .dismissed {
                        matching = activity
                    } else {
                        await activity.end(nil, dismissalPolicy: .immediate)
                    }
                }
                if let matching {
                    await matching.update(content)
                } else if endedAt == nil {
                    guard UIApplication.shared.applicationState == .active,
                          ActivityAuthorizationInfo().areActivitiesEnabled else {
                        call.resolve(["applied": false])
                        return
                    }
                    _ = try Activity.request(
                        attributes: SleepAttributes(sessionId: sessionId, babyName: babyName),
                        content: content, pushType: nil
                    )
                }
                call.resolve(["applied": true])
            } catch {
                call.reject("실시간 현황을 시작하지 못했어요.")
            }
        }
    }
}
