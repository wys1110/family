import ActivityKit
import Foundation

struct SleepAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startedAt: Date
        var endedAt: Date? = nil
    }

    var sessionId: String
    var babyName: String
}
