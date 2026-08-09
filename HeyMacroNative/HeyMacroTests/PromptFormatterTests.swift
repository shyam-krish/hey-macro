import Foundation
import Testing
@testable import HeyMacro

/// Golden tests: expected strings are what the RN `services/llm.ts` formatting code produces
/// for the same fixtures. If these break, the LLM stops preserving existing items correctly.
struct PromptFormatterTests {
    static func entry(
        _ name: String, _ quantity: String, meal: MealType,
        cal: Int, p: Int, c: Int, f: Int
    ) -> FoodEntry {
        FoodEntry(
            foodEntryID: UUID().uuidString, userID: "default-user", dailyLogID: "log-1",
            mealType: meal, name: name, quantity: quantity,
            calories: cal, protein: p, carbs: c, fat: f,
            createdAt: "2026-07-05T12:00:00.000Z", updatedAt: "2026-07-05T12:00:00.000Z"
        )
    }

    static func log(date: String, entries: [FoodEntry]) -> DailyLog {
        DailyLog(
            dailyLogID: "log-1", userID: "default-user", date: LocalDate(validating: date)!,
            totalCalories: entries.reduce(0) { $0 + $1.calories },
            totalProtein: entries.reduce(0) { $0 + $1.protein },
            totalCarbs: entries.reduce(0) { $0 + $1.carbs },
            totalFat: entries.reduce(0) { $0 + $1.fat },
            targetCalories: 2690, targetProtein: 170, targetCarbs: 300, targetFat: 90,
            breakfast: entries.filter { $0.mealType == .breakfast },
            lunch: entries.filter { $0.mealType == .lunch },
            dinner: entries.filter { $0.mealType == .dinner },
            snacks: entries.filter { $0.mealType == .snacks },
            createdAt: "2026-07-05T12:00:00.000Z", updatedAt: "2026-07-05T12:00:00.000Z"
        )
    }

    @Test func foodItemUsesLoadBearingBracketFormat() {
        let eggs = Self.entry("Eggs, scrambled", "3 large", meal: .breakfast, cal: 234, p: 18, c: 2, f: 17)
        #expect(
            PromptFormatter.formatFoodItem(eggs)
                == "Eggs, scrambled (3 large) [234 cal, 18g P, 2g C, 17g F]"
        )
    }

    @Test func mealsOmitEmptyMealsAndJoinItemsWithCommas() {
        let log = Self.log(date: "2026-07-05", entries: [
            Self.entry("Eggs", "2 large", meal: .breakfast, cal: 156, p: 12, c: 1, f: 11),
            Self.entry("Toast", "1 slice", meal: .breakfast, cal: 79, p: 3, c: 15, f: 1),
            Self.entry("Chicken bowl", "1 bowl", meal: .dinner, cal: 650, p: 45, c: 60, f: 20),
        ])
        #expect(PromptFormatter.formatMeals(from: log) == [
            "Breakfast: Eggs (2 large) [156 cal, 12g P, 1g C, 11g F], Toast (1 slice) [79 cal, 3g P, 15g C, 1g F]",
            "Dinner: Chicken bowl (1 bowl) [650 cal, 45g P, 60g C, 20g F]",
        ])
    }

    @Test func timestampIsLocalWithOffsetNotUTC() {
        let date = Date(timeIntervalSince1970: 1_783_100_000)
        let stamp = PromptFormatter.timestamp(date)
        #expect(stamp.wholeMatch(of: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})/) != nil)
        if TimeZone.current.secondsFromGMT(for: date) != 0 {
            #expect(!stamp.hasSuffix("Z"), "must carry the local offset, not UTC (RN bug fix)")
        }
    }

    @Test func foodParsingPromptEmptyDay() {
        let now = Date(timeIntervalSince1970: 1_783_100_000)
        let prompt = PromptFormatter.foodParsingUserPrompt(
            transcript: "I had 3 eggs", currentTime: now, todayLog: nil, previousDayLogs: []
        )
        #expect(prompt == """
            Current Date/Time: \(PromptFormatter.timestamp(now))

            Today's food so far:
            Empty

            Transcript: I had 3 eggs
            """)
    }

    @Test func foodParsingPromptWithTodayAndPreviousDays() {
        let now = Date(timeIntervalSince1970: 1_783_100_000)
        let today = Self.log(date: "2026-07-05", entries: [
            Self.entry("Oatmeal", "1 cup", meal: .breakfast, cal: 300, p: 10, c: 54, f: 6),
        ])
        let previous = [
            Self.log(date: "2026-07-04", entries: [
                Self.entry("Pho", "1 bowl", meal: .dinner, cal: 450, p: 30, c: 55, f: 10),
            ]),
            Self.log(date: "2026-07-03", entries: [
                Self.entry("Dal", "1 cup", meal: .lunch, cal: 220, p: 12, c: 30, f: 6),
                Self.entry("Naan", "1 piece", meal: .lunch, cal: 262, p: 9, c: 45, f: 5),
            ]),
        ]
        let prompt = PromptFormatter.foodParsingUserPrompt(
            transcript: "add a banana", currentTime: now, todayLog: today, previousDayLogs: previous
        )
        #expect(prompt == """
            Current Date/Time: \(PromptFormatter.timestamp(now))

            Previous meals for reference:
            2026-07-04:
            Dinner: Pho (1 bowl) [450 cal, 30g P, 55g C, 10g F]

            2026-07-03:
            Lunch: Dal (1 cup) [220 cal, 12g P, 30g C, 6g F], Naan (1 piece) [262 cal, 9g P, 45g C, 5g F]

            Today's food so far:
            Breakfast: Oatmeal (1 cup) [300 cal, 10g P, 54g C, 6g F]

            Transcript: add a banana
            """)
    }

    @Test func recommendationPromptWithAndWithoutPreviousDays() {
        let now = Date(timeIntervalSince1970: 1_783_100_000)
        let today = Self.log(date: "2026-07-05", entries: [
            Self.entry("Oatmeal", "1 cup", meal: .breakfast, cal: 300, p: 10, c: 54, f: 6),
        ])
        let targets = MacroTargets(
            userID: "default-user", calories: 2690, protein: 170, carbs: 300, fat: 90,
            createdAt: "", updatedAt: ""
        )

        let without = PromptFormatter.recommendationUserPrompt(
            question: "what should I eat", currentTime: now,
            todayLog: today, targets: targets, previousDayLogs: []
        )
        #expect(without == """
            Current Date/Time: \(PromptFormatter.timestamp(now))

            Macro Targets: Calories: 2690, Protein: 170g, Carbs: 300g, Fat: 90g

            Consumed Today: Calories: 300, Protein: 10g, Carbs: 54g, Fat: 6g

            Remaining: Calories: 2390, Protein: 160g, Carbs: 246g, Fat: 84g

            Today's meals:
            Breakfast: Oatmeal (1 cup) [300 cal, 10g P, 54g C, 6g F]

            Question: what should I eat
            """)

        let previous = [Self.log(date: "2026-07-04", entries: [])]
        let with = PromptFormatter.recommendationUserPrompt(
            question: "more protein?", currentTime: now,
            todayLog: today, targets: targets, previousDayLogs: previous
        )
        #expect(with.contains("""

            Previous days:
            2026-07-04: Nothing logged
            Question: more protein?
            """), "empty previous day renders as 'Nothing logged'")
    }
}

struct LLMNormalizationTests {
    @Test func itemWithoutNameThrows() {
        #expect(throws: LLMError.self) {
            _ = try LLMClient.normalizeItem(.init(name: nil, quantity: "1", calories: 100, protein: 1, carbs: 1, fat: 1))
        }
        #expect(throws: LLMError.self) {
            _ = try LLMClient.normalizeItem(.init(name: "", quantity: "1", calories: 100, protein: 1, carbs: 1, fat: 1))
        }
    }

    @Test func quantityDefaultsAndMacroRounding() throws {
        let item = try LLMClient.normalizeItem(
            .init(name: "Rice", quantity: "", calories: 205.6, protein: 4.2, carbs: nil, fat: 0.4)
        )
        #expect(item.quantity == "1 serving", "empty quantity is falsy in JS — defaults apply")
        #expect(item.calories == 206)
        #expect(item.protein == 4)
        #expect(item.carbs == 0, "missing macro coerces to 0")
        #expect(item.fat == 0)
    }

    @Test func missingMealArraysBecomeEmpty() throws {
        let day = try LLMClient.normalize(.init(breakfast: nil, lunch: [], dinner: nil, snacks: nil))
        #expect(day == ParsedDay.empty)
    }

    @Test func sanitizeStripsMarkdownAndURLs() {
        let raw = "Eat **chicken breast** [source](https://usda.gov/x) with rice  (https://cite.com) more at https://example.com  now."
        #expect(LLMClient.sanitizeAnswer(raw) == "Eat chicken breast with rice more at now.")
    }

    @Test func openAISchemasSatisfyStrictMode() throws {
        for schema in [StructuredSchema.foodLog, .recommendation] {
            try assertStrict(schema.openAISchema, path: schema.name)
        }
    }

    /// OpenAI strict structured outputs demand: every object lists ALL properties in `required`
    /// and sets `additionalProperties: false`. A violation is a runtime HTTP 400.
    private func assertStrict(_ node: [String: Any], path: String) throws {
        guard node["type"] as? String == "object" else {
            if let items = node["items"] as? [String: Any] {
                try assertStrict(items, path: path + ".items")
            }
            return
        }
        let properties = try #require(node["properties"] as? [String: Any], "\(path): object missing properties")
        let required = Set(try #require(node["required"] as? [String], "\(path): object missing required"))
        #expect(Set(properties.keys) == required, "\(path): strict mode requires ALL keys in required")
        #expect(node["additionalProperties"] as? Bool == false, "\(path): additionalProperties must be false")
        for (key, value) in properties {
            if let child = value as? [String: Any] {
                try assertStrict(child, path: "\(path).\(key)")
            }
        }
    }
}
