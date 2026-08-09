import SwiftUI

/// The "Food" section: title + one card per non-empty meal (RN renders nothing for empty meals).
struct FoodSection: View {
    var log: DailyLog
    var onMealTap: (MealType) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Food")
                .font(Theme.Fonts.ui(28, weight: .bold))
                .foregroundStyle(Theme.Colors.textPrimary)

            if log.isEmpty {
                EmptyFoodState()
                    .frame(maxWidth: .infinity)
            } else {
                ForEach(MealType.allCases, id: \.self) { meal in
                    let entries = log.entries(for: meal)
                    if !entries.isEmpty {
                        MealCard(meal: meal, entries: entries) {
                            Haptics.lightTap()
                            onMealTap(meal)
                        }
                    }
                }
            }
        }
    }
}

/// One meal: names column (left, #1a1a1a) + stacked totals column (right, #252525).
struct MealCard: View {
    var meal: MealType
    var entries: [FoodEntry]
    var onTap: () -> Void

    private var totals: (calories: Int, protein: Int, carbs: Int, fat: Int) {
        (
            entries.reduce(0) { $0 + $1.calories },
            entries.reduce(0) { $0 + $1.protein },
            entries.reduce(0) { $0 + $1.carbs },
            entries.reduce(0) { $0 + $1.fat }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(meal.displayName)
                .font(Theme.Fonts.ui(14))
                .foregroundStyle(Theme.Colors.textSecondary)

            Button(action: onTap) {
                // Both columns stretch to the taller one, forming a single box (RN's
                // default flexbox stretch): names pin to the top, totals center vertically.
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(entries) { entry in
                            Text(entry.name)
                                .font(Theme.Fonts.ui(14))
                                .foregroundStyle(Theme.Colors.textPrimary)
                                .multilineTextAlignment(.leading)
                                .padding(.leading, 12)
                                .overlay(alignment: .leading) {
                                    Rectangle()
                                        .fill(Theme.Colors.textTertiary)
                                        .frame(width: 2)
                                }
                        }
                    }
                    .padding(15)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .background(Theme.Colors.card)

                    VStack(alignment: .trailing, spacing: 4) {
                        totalText("\(totals.calories)", unit: " cal")
                        totalText("\(totals.protein)", unit: "g P")
                        totalText("\(totals.carbs)", unit: "g C")
                        totalText("\(totals.fat)", unit: "g F")
                    }
                    .padding(15)
                    .frame(maxHeight: .infinity)
                    .background(Theme.Colors.surface2)
                }
                .fixedSize(horizontal: false, vertical: true)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Spacing.cardRadius))
            }
            .buttonStyle(Theme.FlatCardButtonStyle())
        }
    }

    private func totalText(_ value: String, unit: String) -> some View {
        Text("\(Text(value).foregroundStyle(Theme.Colors.textPrimary))\(Text(unit).foregroundStyle(Theme.Colors.textMutedLight))")
            .font(Theme.Fonts.number(16))
    }
}

struct EmptyFoodState: View {
    var body: some View {
        VStack(spacing: 8) {
            Text("No food logged yet")
                .font(Theme.Fonts.ui(18, weight: .semibold))
                .foregroundStyle(Theme.Colors.textTertiary)
            Text("Use the input below to get started")
                .font(Theme.Fonts.ui(14))
                .foregroundStyle(Theme.Colors.textFaint)
        }
        .padding(.vertical, 60)
    }
}

/// Weight card: tap to open the weight sheet.
struct WeightCard: View {
    var weight: Double?
    var onTap: () -> Void

    var body: some View {
        Button {
            Haptics.lightTap()
            onTap()
        } label: {
            HStack {
                Text("Weight")
                    .font(Theme.Fonts.ui(16, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                if let weight {
                    Text("\(Text(Self.format(weight)).font(Theme.Fonts.number(18)).foregroundStyle(Theme.Colors.textPrimary))\(Text(" lbs").font(Theme.Fonts.ui(14)).foregroundStyle(Theme.Colors.textSecondary))")
                } else {
                    HStack(spacing: 8) {
                        Text("tap to log")
                            .font(Theme.Fonts.ui(14))
                            .foregroundStyle(Theme.Colors.textTertiary)
                        Text("+")
                            .font(Theme.Fonts.ui(18))
                            .foregroundStyle(Theme.Colors.textSecondary)
                    }
                }
            }
            .padding(15)
            .background(Theme.Colors.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Spacing.cardRadius))
        }
        .buttonStyle(Theme.FlatCardButtonStyle())
    }

    static func format(_ weight: Double) -> String {
        weight.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", weight)
            : String(format: "%.1f", weight)
    }
}
