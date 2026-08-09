import SwiftUI

/// The calorie ring: 120pt, 10pt stroke, rounded cap, animated fill with count-up center text.
struct CalorieRing: View {
    var current: Int
    var target: Int
    var isToday: Bool
    var size: CGFloat = 120
    var strokeWidth: CGFloat = 10

    private var progress: Double {
        guard target > 0 else { return 0 }
        return min(Double(current) / Double(target), 1)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.Colors.track, lineWidth: strokeWidth)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    Self.ringColor(current: current, target: target, isToday: isToday),
                    style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.8), value: progress)

            VStack(spacing: 0) {
                Text("\(current)")
                    .font(Theme.Fonts.number(28))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .contentTransition(.numericText(value: Double(current)))
                    .animation(.easeOut(duration: 0.8), value: current)
                Text("/\(target)")
                    .font(Theme.Fonts.number(14))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Calories")
        .accessibilityValue(
            "\(current.formatted()) of \(target.formatted()) calories"
        )
    }

    /// Ported color tiers (HomeScreen.tsx CalorieRing):
    /// - Today: accent until more than 150 over target, then dark red.
    /// - Past days: within ±150 green ("nailed it"), within ±300 amber, else red.
    static func ringColor(current: Int, target: Int, isToday: Bool) -> Color {
        let diff = current - target
        if isToday {
            return diff > 150 ? Theme.Colors.ringRed : Theme.Colors.accent
        }
        switch abs(diff) {
        case ...150: return Theme.Colors.ringGreen
        case ...300: return Theme.Colors.ringAmber
        default: return Theme.Colors.ringRed
        }
    }

    /// Calendar mini-rings share the tiers except past under-or-at-target renders white.
    static func calendarRingColor(current: Int, target: Int, isToday: Bool) -> Color {
        let color = ringColor(current: current, target: target, isToday: isToday)
        if !isToday && color == Theme.Colors.ringGreen { return .white }
        return color
    }
}

/// One macro progress bar: label + `current/target` header, white fill, red overflow layer.
struct MacroProgressBar: View {
    var label: String
    var current: Int
    var target: Int

    private var progress: Double {
        guard target > 0 else { return 0 }
        return min(Double(current) / Double(target), 1)
    }

    private var overflow: Double {
        guard target > 0, current > target else { return 0 }
        return min(Double(current - target) / Double(target), 1)
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Text(label)
                    .font(Theme.Fonts.ui(14))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                Text("\(Text("\(current)").fontWeight(.bold).foregroundStyle(Theme.Colors.textPrimary))\(Text("/\(target)").foregroundStyle(Theme.Colors.textSecondary))")
                    .font(Theme.Fonts.number(14))
                    .contentTransition(.numericText(value: Double(current)))
                    .animation(.easeOut(duration: 0.6), value: current)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Theme.Colors.track)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(.white)
                        .frame(width: geo.size.width * progress)
                        .animation(.easeOut(duration: 0.6), value: progress)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Theme.Colors.deleteRed)
                        .frame(width: geo.size.width * overflow)
                        .animation(.easeOut(duration: 0.6), value: overflow)
                }
            }
            .frame(height: 8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue("\(current.formatted()) of \(target.formatted()) grams")
    }
}
