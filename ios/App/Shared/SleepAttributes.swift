import ActivityKit
import Foundation

struct SleepAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startedAt: Date
    }

    var sessionId: String
    var babyName: String
}
