import SwiftUI

/// Weight entry with a custom keypad (no system keyboard): one decimal point, one decimal
/// place, max 5 characters — matching the RN sheet's input rules.
struct WeightInputSheet: View {
    var initialWeight: Double?
    var previousWeight: Double?
    var onSave: (Double) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var input: String = ""

    private var isValid: Bool {
        (Double(input) ?? 0) > 0
    }

    var body: some View {
        VStack(spacing: 20) {
            Capsule()
                .fill(Theme.Colors.textFaint)
                .frame(width: 40, height: 4)
                .padding(.top, 12)

            Text("Log Weight")
                .font(Theme.Fonts.ui(20, weight: .semibold))
                .foregroundStyle(Theme.Colors.textPrimary)
                .padding(.top, 12)

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(input.isEmpty ? "0.0" : input)
                    .font(Theme.Fonts.number(48))
                    .foregroundStyle(input.isEmpty ? Theme.Colors.textDisabled : Theme.Colors.textPrimary)
                    .contentTransition(.numericText())
                Text("lbs")
                    .font(Theme.Fonts.ui(20))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }

            if let previousWeight {
                Text("Previous: \(WeightCard.format(previousWeight)) lbs")
                    .font(Theme.Fonts.ui(14))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }

            Button {
                guard let weight = Double(input), weight > 0 else { return }
                Haptics.success()
                onSave(weight)
                dismiss()
            } label: {
                Text("Save")
                    .font(Theme.Fonts.ui(17, weight: .semibold))
                    .foregroundStyle(isValid ? .black : Theme.Colors.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(isValid ? Theme.Colors.accent : Theme.Colors.track)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(!isValid)
            .padding(.horizontal, Theme.Spacing.sheetPadding)

            keypad
                .padding(.bottom, 12)
        }
        .padding(.horizontal, 8)
        .presentationDetents([.height(480)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(Theme.Colors.card)
        .onAppear {
            if let initialWeight {
                input = WeightCard.format(initialWeight)
            } else if let previousWeight {
                input = WeightCard.format(previousWeight)
            }
        }
    }

    private var keypad: some View {
        let keys = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [".", "0", "⌫"]]
        return VStack(spacing: 8) {
            ForEach(keys, id: \.self) { row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { key in
                        Button {
                            Haptics.lightTap()
                            press(key)
                        } label: {
                            Text(key)
                                .font(Theme.Fonts.number(28))
                                .foregroundStyle(Theme.Colors.textPrimary)
                                .frame(maxWidth: .infinity)
                                .frame(height: 56)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// RN rules: single decimal point, one decimal place, max 5 chars, "." on empty → "0.".
    private func press(_ key: String) {
        switch key {
        case "⌫":
            if !input.isEmpty { input.removeLast() }
        case ".":
            if input.isEmpty {
                input = "0."
            } else if !input.contains(".") && input.count < 4 {
                input += "."
            }
        default:
            guard input.count < 5 else { return }
            if let dotIndex = input.firstIndex(of: "."), input.distance(from: dotIndex, to: input.endIndex) > 1 {
                return // already one decimal place
            }
            input += key
        }
    }
}
