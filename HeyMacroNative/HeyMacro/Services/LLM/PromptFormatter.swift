import Foundation

/// Pure functions building the user messages — a 1:1 port of the formatting code in
/// `services/llm.ts` (lines 87–145 and 193–223). The bracket item format is load-bearing:
/// the system prompt tells the model to preserve unmodified items with EXACTLY these values.
enum PromptFormatter {
    /// `{name} ({quantity}) [{cal} cal, {P}g P, {C}g C, {F}g F]`
    static func formatFoodItem(_ entry: FoodEntry) -> String {
        "\(entry.name) (\(entry.quantity)) [\(entry.calories) cal, \(entry.protein)g P, \(entry.carbs)g C, \(entry.fat)g F]"
    }

    /// One line per non-empty meal: `Breakfast: item, item` — empty meals are omitted entirely.
    static func formatMeals(from log: DailyLog) -> [String] {
        MealType.allCases.compactMap { meal in
            let entries = log.entries(for: meal)
            guard !entries.isEmpty else { return nil }
            let items = entries.map(formatFoodItem).joined(separator: ", ")
            return "\(meal.displayName): \(items)"
        }
    }

    /// Local ISO-8601 with timezone offset (e.g. `2026-07-05T13:42:10-07:00`).
    ///
    /// Deliberate fix vs RN, which sent UTC `toISOString()`: the system prompt infers meal type
    /// from wall-clock time ("Before 11:00 AM → breakfast"), so the model must see local time.
    static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = .current
        return formatter.string(from: date)
    }

    static func foodParsingUserPrompt(
        transcript: String,
        currentTime: Date,
        todayLog: DailyLog?,
        previousDayLogs: [DailyLog]
    ) -> String {
        var previousMealsContext = ""
        if !previousDayLogs.isEmpty {
            previousMealsContext = previousDayLogs
                .map { log in "\(log.date.value):\n\(formatMeals(from: log).joined(separator: "\n"))" }
                .joined(separator: "\n\n")
        }

        var todayFoodContext = "Empty"
        if let todayLog {
            let meals = formatMeals(from: todayLog)
            if !meals.isEmpty {
                todayFoodContext = meals.joined(separator: "\n")
            }
        }

        let previousBlock = previousMealsContext.isEmpty
            ? ""
            : "Previous meals for reference:\n\(previousMealsContext)\n\n"

        return """
            Current Date/Time: \(timestamp(currentTime))

            \(previousBlock)Today's food so far:
            \(todayFoodContext)

            Transcript: \(transcript)
            """
    }

    static func recommendationUserPrompt(
        question: String,
        currentTime: Date,
        todayLog: DailyLog,
        targets: MacroTargets,
        previousDayLogs: [DailyLog]
    ) -> String {
        let remaining = (
            calories: targets.calories - todayLog.totalCalories,
            protein: targets.protein - todayLog.totalProtein,
            carbs: targets.carbs - todayLog.totalCarbs,
            fat: targets.fat - todayLog.totalFat
        )

        let mealsContext = formatMeals(from: todayLog)

        var previousDaysContext = ""
        if !previousDayLogs.isEmpty {
            previousDaysContext = previousDayLogs
                .map { log in
                    let meals = formatMeals(from: log)
                    return "\(log.date.value): \(meals.isEmpty ? "Nothing logged" : meals.joined(separator: ", "))"
                }
                .joined(separator: "\n")
        }

        let previousBlock = previousDaysContext.isEmpty
            ? ""
            : "\nPrevious days:\n\(previousDaysContext)"

        return """
            Current Date/Time: \(timestamp(currentTime))

            Macro Targets: Calories: \(targets.calories), Protein: \(targets.protein)g, Carbs: \(targets.carbs)g, Fat: \(targets.fat)g

            Consumed Today: Calories: \(todayLog.totalCalories), Protein: \(todayLog.totalProtein)g, Carbs: \(todayLog.totalCarbs)g, Fat: \(todayLog.totalFat)g

            Remaining: Calories: \(remaining.calories), Protein: \(remaining.protein)g, Carbs: \(remaining.carbs)g, Fat: \(remaining.fat)g

            Today's meals:
            \(mealsContext.isEmpty ? "Nothing logged yet" : mealsContext.joined(separator: "\n"))
            \(previousBlock)
            Question: \(question)
            """
    }
}
