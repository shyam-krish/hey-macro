import Foundation
import GRDB

/// GRDB records mirroring the RN schema exactly (`services/storage.ts`).
/// Column names are camelCase in SQLite, so Codable mapping needs no CodingKeys.
/// `createdAt`/`updatedAt` are ISO-8601 UTC strings (audit-only); `date` columns are
/// local `"YYYY-MM-DD"` strings — see `LocalDate`.

struct User: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "users"

    var userID: String
    var firstName: String
    var lastName: String
    var createdAt: String
    var updatedAt: String
}

struct MacroTargets: Codable, FetchableRecord, PersistableRecord, Sendable, Equatable {
    static let databaseTableName = "macro_targets"

    var userID: String
    var calories: Int
    var protein: Int
    var carbs: Int
    var fat: Int
    var createdAt: String
    var updatedAt: String
}

/// The raw `daily_logs` row. Screens usually want the hydrated `DailyLog` instead.
struct DailyLogRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "daily_logs"

    var dailyLogID: String
    var userID: String
    var date: String
    var totalCalories: Int
    var totalProtein: Int
    var totalCarbs: Int
    var totalFat: Int
    var targetCalories: Int
    var targetProtein: Int
    var targetCarbs: Int
    var targetFat: Int
    var createdAt: String
    var updatedAt: String
}

struct FoodEntry: Codable, FetchableRecord, PersistableRecord, Sendable, Identifiable, Equatable {
    static let databaseTableName = "food_entries"

    var foodEntryID: String
    var userID: String
    var dailyLogID: String
    var mealType: MealType
    var name: String
    var quantity: String
    var calories: Int
    var protein: Int
    var carbs: Int
    var fat: Int
    var createdAt: String
    var updatedAt: String

    var id: String { foodEntryID }
}

struct WeightLog: Codable, FetchableRecord, PersistableRecord, Sendable, Equatable {
    static let databaseTableName = "weight_logs"

    var weightLogID: String
    var userID: String
    var date: String
    var weight: Double
    var createdAt: String
    var updatedAt: String
}

/// A day's log hydrated with its food entries grouped by meal — the shape every screen consumes
/// (mirrors the TS `DailyLog`).
struct DailyLog: Sendable, Equatable {
    var dailyLogID: String
    var userID: String
    var date: LocalDate
    var totalCalories: Int
    var totalProtein: Int
    var totalCarbs: Int
    var totalFat: Int
    var targetCalories: Int
    var targetProtein: Int
    var targetCarbs: Int
    var targetFat: Int
    var breakfast: [FoodEntry]
    var lunch: [FoodEntry]
    var dinner: [FoodEntry]
    var snacks: [FoodEntry]
    var createdAt: String
    var updatedAt: String

    func entries(for meal: MealType) -> [FoodEntry] {
        switch meal {
        case .breakfast: breakfast
        case .lunch: lunch
        case .dinner: dinner
        case .snacks: snacks
        }
    }

    var allEntries: [FoodEntry] { breakfast + lunch + dinner + snacks }
    var isEmpty: Bool { allEntries.isEmpty }
}
