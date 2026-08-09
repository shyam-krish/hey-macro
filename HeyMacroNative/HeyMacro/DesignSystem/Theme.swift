import SwiftUI

/// Design tokens ported from the RN app. Colors are the exact hex values used across
/// HomeScreen/Trends/Profile/sheets; fonts preserve the Avenir-for-text / DIN-for-numbers split.
enum Theme {
    enum Colors {
        static let background = Color(hex: 0x000000)
        static let accent = Color(hex: 0x3FE0DB)
        static let card = Color(hex: 0x1A1A1A)
        static let elevated = Color(hex: 0x1C1C1E)
        static let surface2 = Color(hex: 0x252525)
        static let track = Color(hex: 0x333333)
        static let divider = Color(hex: 0x2A2A2A)
        static let gridLine = Color(hex: 0x222222)

        static let textPrimary = Color.white
        static let textSecondary = Color(hex: 0x888888)
        static let textTertiary = Color(hex: 0x666666)
        static let textFaint = Color(hex: 0x444444)
        static let textDisabled = Color(hex: 0x555555)
        static let textMutedLight = Color(hex: 0xA3A3A3)

        static let error = Color(hex: 0xFF6B6B)
        static let recording = Color(hex: 0xFF4444)
        static let deleteRed = Color(hex: 0xDC2626)
        static let ringRed = Color(hex: 0x991B1B)
        static let ringGreen = Color(hex: 0x065F46)
        static let ringAmber = Color(hex: 0x92400E)
        static let badgeGreenText = Color(hex: 0x34D399)
        static let calculatedFieldBackground = Color(hex: 0x0D2818)
        static let weight = Color(hex: 0xF59E0B)
    }

    enum Fonts {
        /// Avenir Next — all UI text. Weight maps to the family's faces.
        static func ui(
            _ size: CGFloat,
            weight: UIWeight = .regular,
            relativeTo textStyle: Font.TextStyle? = nil
        ) -> Font {
            Font.custom(
                weight.postScriptName,
                size: size,
                relativeTo: textStyle ?? uiTextStyle(for: size)
            )
        }

        /// DIN Alternate — every number/metric in the app. The family ships Bold only.
        static func number(_ size: CGFloat, relativeTo textStyle: Font.TextStyle? = nil) -> Font {
            Font.custom(
                "DINAlternate-Bold",
                size: size,
                relativeTo: textStyle ?? numberTextStyle(for: size)
            )
            .monospacedDigit()
        }

        private static func uiTextStyle(for size: CGFloat) -> Font.TextStyle {
            switch size {
            case 28...: .title
            case 22...: .title2
            case 20...: .title3
            case 17...: .body
            case 15...: .callout
            case 13...: .footnote
            default: .caption
            }
        }

        private static func numberTextStyle(for size: CGFloat) -> Font.TextStyle {
            switch size {
            case 36...: .largeTitle
            case 28...: .title
            case 22...: .title2
            case 18...: .title3
            case 16...: .body
            case 13...: .callout
            default: .caption
            }
        }

        enum UIWeight {
            case regular, medium, semibold, bold

            var postScriptName: String {
                switch self {
                case .regular: "AvenirNext-Regular"
                case .medium: "AvenirNext-Medium"
                case .semibold: "AvenirNext-DemiBold"
                case .bold: "AvenirNext-Bold"
                }
            }
        }
    }

    enum Spacing {
        static let screenPadding: CGFloat = 20
        static let sheetPadding: CGFloat = 24
        static let cardRadius: CGFloat = 12
        static let sheetRadius: CGFloat = 24
        static let pillRadius: CGFloat = 24
    }

    /// Press feedback for flat content cards. Glass controls already supply their own
    /// system interaction response, so this style intentionally stays off chrome.
    struct FlatCardButtonStyle: ButtonStyle {
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .scaleEffect(reduceMotion || !configuration.isPressed ? 1 : 0.96)
                .opacity(configuration.isPressed ? 0.86 : 1)
                .animation(
                    reduceMotion ? nil : .easeOut(duration: 0.12),
                    value: configuration.isPressed
                )
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
