#if DEBUG
import Foundation

/// `-seedDemoData` launch argument: wipes and repopulates the database so simulator
/// screenshots always show a lived-in Home screen. Never compiled into release builds.
enum SeedData {
    static func seed(into store: DataStore) async throws {
        try await store.clearAllData()
        _ = try await store.getOrCreateDefaultUser()
        _ = try await store.updateUser(
            userID: DataStore.defaultUserID, firstName: "Shyam", lastName: "K"
        )

        let today = LocalDate.today()

        // ~6 weeks of history with varied adherence and natural gaps, so the trends
        // ranges (7D/30D/90D) actually differ and rings show all color tiers.
        // Deterministic pseudo-variation — no randomness, so screenshots are stable.
        for offset in stride(from: -42, through: -1, by: 1) {
            // Skip a couple of days per week to simulate unlogged days.
            if offset % 7 == -3 || offset % 11 == -5 { continue }

            let date = today.adding(days: offset)
            let wave = Double(abs(offset % 9)) / 9.0
            let calories = 2350 + Int(wave * 800) // 2350–3150, cycling through tiers
            let log = try await store.getOrCreateDailyLog(userID: DataStore.defaultUserID, date: date)
            try await store.replaceDailyFoodEntries(
                userID: DataStore.defaultUserID, dailyLogID: log.dailyLogID,
                with: demoDay(totalCalories: calories)
            )
            // Weight logged most days, trending down 184 → 180.
            if offset % 5 != -2 {
                let weight = 180.0 + Double(-offset) * 0.09
                _ = try await store.saveWeightLog(
                    userID: DataStore.defaultUserID, date: date,
                    weight: (weight * 10).rounded() / 10
                )
            }
        }

        // Today: partially eaten.
        let todayLog = try await store.getOrCreateDailyLog(userID: DataStore.defaultUserID, date: today)
        try await store.replaceDailyFoodEntries(
            userID: DataStore.defaultUserID, dailyLogID: todayLog.dailyLogID,
            with: ParsedDay(
                breakfast: [
                    ParsedFoodItem(name: "Eggs, scrambled", quantity: "3 large", calories: 234, protein: 18, carbs: 2, fat: 17),
                    ParsedFoodItem(name: "Sourdough toast", quantity: "2 slices", calories: 180, protein: 7, carbs: 34, fat: 2),
                ],
                lunch: [
                    ParsedFoodItem(name: "Chicken burrito bowl", quantity: "1 bowl", calories: 705, protein: 47, carbs: 68, fat: 26),
                ],
                dinner: [],
                snacks: [
                    ParsedFoodItem(name: "Greek yogurt", quantity: "1 cup", calories: 130, protein: 20, carbs: 9, fat: 0),
                ]
            )
        )
        _ = try await store.saveWeightLog(userID: DataStore.defaultUserID, date: today, weight: 180.0)
    }

    /// Rough day that sums near the requested calories, split across meals.
    private static func demoDay(totalCalories: Int) -> ParsedDay {
        let breakfast = totalCalories * 25 / 100
        let lunch = totalCalories * 35 / 100
        let dinner = totalCalories - breakfast - lunch
        func item(_ name: String, _ cal: Int) -> ParsedFoodItem {
            ParsedFoodItem(
                name: name, quantity: "1 serving",
                calories: cal, protein: cal * 30 / 400, carbs: cal * 45 / 400, fat: cal / 36
            )
        }
        return ParsedDay(
            breakfast: [item("Oatmeal with berries", breakfast)],
            lunch: [item("Chicken and rice", lunch)],
            dinner: [item("Salmon with vegetables", dinner)],
            snacks: []
        )
    }
}
#endif
