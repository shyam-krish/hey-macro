import UIKit

/// Centralized haptics — new in the native app (the RN version had none).
/// Kept minimal and semantic so call sites read as intent, not hardware.
@MainActor
enum Haptics {
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    static func impact() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func lightTap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}
