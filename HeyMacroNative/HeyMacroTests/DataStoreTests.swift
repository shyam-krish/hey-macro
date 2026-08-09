import Foundation
import Testing
import GRDB
@testable import HeyMacro

/// Tests for the storage.ts port — every semantic here mirrors observable RN behavior.
struct DataStoreTests {
    static let fixedToday = LocalDate(validating: "2026-07-05")!

    static func makeStore() throws -> DataStore {
        DataStore(try AppDatabase.inMemory(), today: { fixedToday })
    }

    static func item(
        _ name: String, quantity: String = "1 serving",
        calories: Int = 100, protein: Int = 10, carbs: Int = 10, fat: Int = 2
    ) -> ParsedFoodItem {
        ParsedFoodItem(name: name, quantity: quantity, calories: calories, protein: protein, carbs: carbs, fat: fat)
    }

    // MARK: First launch

    @Test func firstLaunchCreatesDefaultUserAndTargets() async throws {
        let store = try Self.makeStore()
        let user = try await store.getOrCreateDefaultUser()
        #expect(user.userID == "default-user")
        #expect(user.firstName == "Default")
        #expect(user.lastName == "Name")

        let targets = try await store.getOrCreateMacroTargets(userID: user.userID)
        #expect(targets.calories == 2690)
        #expect(targets.protein == 170)
        #expect(targets.carbs == 300)
        #expect(targets.fat == 90)
    }

    @Test func dailyLogCreatedOnceWithZeroTotals() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()

        let first = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(first.totalCalories == 0)
        #expect(first.isEmpty)

        let second = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(second.dailyLogID == first.dailyLogID)
    }

    // MARK: Target snapshot semantics

    @Test func newDailyLogSnapshotsCurrentTargets() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()
        // Targets row must exist before update — mirrors app boot (updateMacroTargets is
        // an UPDATE, not an upsert, same as the RN storage layer).
        _ = try await store.getOrCreateMacroTargets(userID: "default-user")
        _ = try await store.updateMacroTargets(userID: "default-user", calories: 2000, protein: 150, carbs: 200, fat: 70)

        let log = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(log.targetCalories == 2000)
        #expect(log.targetProtein == 150)
    }

    @Test func updatingTargetsRewritesTodayOnly() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()

        let yesterday = Self.fixedToday.adding(days: -1)
        let pastLog = try await store.getOrCreateDailyLog(userID: "default-user", date: yesterday)
        let todayLog = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(pastLog.targetCalories == 2690)
        #expect(todayLog.targetCalories == 2690)

        _ = try await store.updateMacroTargets(userID: "default-user", calories: 3000, protein: 200, carbs: 320, fat: 100)

        let pastAfter = try await store.getOrCreateDailyLog(userID: "default-user", date: yesterday)
        let todayAfter = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(pastAfter.targetCalories == 2690, "past days keep the targets they were logged under")
        #expect(todayAfter.targetCalories == 3000, "today's snapshot follows the global edit")
    }

    // MARK: Replace-all save

    @Test func replaceDailyFoodEntriesReplacesAndTotals() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()
        let log = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)

        let firstState = ParsedDay(
            breakfast: [Self.item("Eggs", calories: 140, protein: 12, carbs: 1, fat: 10)],
            lunch: [], dinner: [], snacks: []
        )
        try await store.replaceDailyFoodEntries(userID: "default-user", dailyLogID: log.dailyLogID, with: firstState)

        let secondState = ParsedDay(
            breakfast: [
                Self.item("Eggs", calories: 140, protein: 12, carbs: 1, fat: 10),
                Self.item("Toast", calories: 80, protein: 3, carbs: 15, fat: 1),
            ],
            lunch: [Self.item("Chicken bowl", calories: 650, protein: 45, carbs: 60, fat: 20)],
            dinner: [], snacks: []
        )
        try await store.replaceDailyFoodEntries(userID: "default-user", dailyLogID: log.dailyLogID, with: secondState)

        let after = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(after.breakfast.count == 2)
        #expect(after.lunch.count == 1)
        #expect(after.allEntries.count == 3, "old entries fully replaced, not appended")
        #expect(after.totalCalories == 140 + 80 + 650)
        #expect(after.totalProtein == 12 + 3 + 45)
        #expect(after.totalCarbs == 1 + 15 + 60)
        #expect(after.totalFat == 10 + 1 + 20)
    }

    @Test func totalsLazilyReconcileAfterEntryMutations() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()
        let log = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)

        // addFoodEntry does NOT update stored totals — the next read self-heals them.
        let entry = try await store.addFoodEntry(
            userID: "default-user", dailyLogID: log.dailyLogID, mealType: .snacks,
            item: Self.item("Protein bar", calories: 200, protein: 20, carbs: 20, fat: 6)
        )
        let read1 = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(read1.totalCalories == 200)

        try await store.updateFoodEntry(
            foodEntryID: entry.foodEntryID,
            updates: .init(calories: 250, protein: 25)
        )
        let read2 = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(read2.totalCalories == 250)
        #expect(read2.totalProtein == 25)

        try await store.deleteFoodEntry(foodEntryID: entry.foodEntryID)
        let read3 = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        #expect(read3.totalCalories == 0)
        #expect(read3.isEmpty)
    }

    // MARK: LLM context queries

    @Test func previousDaysLogsExcludeTodayAndEmptyDays() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()

        // Today (has food, must be excluded), -1 (food), -2 (empty log), -3 (food)
        for offset in [0, -1, -3] {
            let date = Self.fixedToday.adding(days: offset)
            let log = try await store.getOrCreateDailyLog(userID: "default-user", date: date)
            try await store.replaceDailyFoodEntries(
                userID: "default-user", dailyLogID: log.dailyLogID,
                with: ParsedDay(breakfast: [Self.item("Meal \(offset)")], lunch: [], dinner: [], snacks: [])
            )
        }
        _ = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday.adding(days: -2))

        let previous = try await store.getPreviousDaysLogs(userID: "default-user", days: 7)
        #expect(previous.count == 2)
        #expect(previous[0].date == Self.fixedToday.adding(days: -1), "most recent first")
        #expect(previous[1].date == Self.fixedToday.adding(days: -3))
    }

    // MARK: Weight

    @Test func weightLogUpsertsPerDate() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()

        let first = try await store.saveWeightLog(userID: "default-user", date: Self.fixedToday, weight: 180.5)
        let updated = try await store.saveWeightLog(userID: "default-user", date: Self.fixedToday, weight: 179.9)
        #expect(updated.weightLogID == first.weightLogID, "same day updates in place")
        #expect(updated.weight == 179.9)

        let yesterday = Self.fixedToday.adding(days: -1)
        _ = try await store.saveWeightLog(userID: "default-user", date: yesterday, weight: 181.2)
        let previous = try await store.getPreviousWeightLog(userID: "default-user", before: Self.fixedToday)
        #expect(previous?.weight == 181.2)
    }

    // MARK: Trends

    @Test func trendDataMergesCaloriesAndWeightByDate() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()

        // Day -2: food only. Day -1: weight only. Day 0: both.
        let dayFood = Self.fixedToday.adding(days: -2)
        let dayWeight = Self.fixedToday.adding(days: -1)

        let foodLog = try await store.getOrCreateDailyLog(userID: "default-user", date: dayFood)
        try await store.replaceDailyFoodEntries(
            userID: "default-user", dailyLogID: foodLog.dailyLogID,
            with: ParsedDay(breakfast: [Self.item("Oats", calories: 300)], lunch: [], dinner: [], snacks: [])
        )
        _ = try await store.saveWeightLog(userID: "default-user", date: dayWeight, weight: 180)

        let todayLog = try await store.getOrCreateDailyLog(userID: "default-user", date: Self.fixedToday)
        try await store.replaceDailyFoodEntries(
            userID: "default-user", dailyLogID: todayLog.dailyLogID,
            with: ParsedDay(breakfast: [], lunch: [Self.item("Bowl", calories: 700)], dinner: [], snacks: [])
        )
        _ = try await store.saveWeightLog(userID: "default-user", date: Self.fixedToday, weight: 179.5)

        let points = try await store.getTrendData(userID: "default-user", from: dayFood, to: Self.fixedToday)
        #expect(points.count == 3)

        #expect(points[0].date == dayFood)
        #expect(points[0].calories == 300)
        #expect(points[0].weight == nil)

        #expect(points[1].date == dayWeight)
        #expect(points[1].calories == nil, "weight-only day has no daily_logs row")
        #expect(points[1].weight == 180)

        #expect(points[2].calories == 700)
        #expect(points[2].weight == 179.5)
    }

    @Test func mealAveragesDivideByLoggedDaysNotSpan() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()

        // 2 logged days within a 30-day span: averages divide by 2, not 30.
        for (offset, calories) in [(-10, 400), (-5, 600)] {
            let date = Self.fixedToday.adding(days: offset)
            let log = try await store.getOrCreateDailyLog(userID: "default-user", date: date)
            try await store.replaceDailyFoodEntries(
                userID: "default-user", dailyLogID: log.dailyLogID,
                with: ParsedDay(
                    breakfast: [Self.item("B", calories: calories, protein: 30, carbs: 40, fat: 10)],
                    lunch: [], dinner: [], snacks: []
                )
            )
        }

        let averages = try await store.getMealAverages(
            userID: "default-user",
            from: Self.fixedToday.adding(days: -30), to: Self.fixedToday
        )
        #expect(averages.loggedDays == 2)
        #expect(averages.breakfast.calories == 500)
        #expect(averages.breakfast.protein == 30)
        #expect(averages.lunch.calories == 0)
        #expect(averages.total.calories == 500)
    }

    @Test func mealAveragesEmptyRangeReturnsZeros() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()
        let averages = try await store.getMealAverages(
            userID: "default-user",
            from: Self.fixedToday.adding(days: -7), to: Self.fixedToday
        )
        #expect(averages == MealAverages())
    }

    // MARK: Calendar month data

    @Test func monthDataBoundedToMonth() async throws {
        let store = try Self.makeStore()
        _ = try await store.getOrCreateDefaultUser()

        let inMonth = LocalDate(validating: "2026-07-01")!
        let outOfMonth = LocalDate(validating: "2026-06-30")!
        for date in [inMonth, outOfMonth] {
            let log = try await store.getOrCreateDailyLog(userID: "default-user", date: date)
            try await store.replaceDailyFoodEntries(
                userID: "default-user", dailyLogID: log.dailyLogID,
                with: ParsedDay(breakfast: [Self.item("X", calories: 500)], lunch: [], dinner: [], snacks: [])
            )
        }

        let july = try await store.getMonthCalorieData(userID: "default-user", year: 2026, month: 7)
        #expect(july.count == 1)
        #expect(july[0].date == inMonth)
        #expect(july[0].calories == 500)
        #expect(july[0].calorieTarget == 2690)

        let earliest = try await store.getEarliestLogDate(userID: "default-user")
        #expect(earliest == outOfMonth)
    }
}
