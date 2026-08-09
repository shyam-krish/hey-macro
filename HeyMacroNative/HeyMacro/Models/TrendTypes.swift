import Foundation

/// One point per date for the Trends chart. Nullable fields mean "nothing logged that day"
/// (mirrors the TS `TrendDataPoint`).
struct TrendPoint: Sendable, Equatable {
    var date: LocalDate
    var calories: Int?
    var calorieTarget: Int?
    var weight: Double?
}

/// Calendar ring datum for one day of a month (mirrors the TS `DateCalorieData`).
struct DayCalorieDatum: Sendable, Equatable {
    var date: LocalDate
    var calories: Int
    var calorieTarget: Int
}

struct DayWeightDatum: Sendable, Equatable {
    var date: LocalDate
    var weight: Double
}

struct MealAverage: Sendable, Equatable {
    var calories = 0
    var protein = 0
    var carbs = 0
    var fat = 0
}

/// Per-meal averages over a range, divided by the number of *distinct days with food logged*
/// (not the calendar span) — mirrors `getMealAverages` in storage.ts.
struct MealAverages: Sendable, Equatable {
    var loggedDays = 0
    var breakfast = MealAverage()
    var lunch = MealAverage()
    var dinner = MealAverage()
    var snacks = MealAverage()
    var total = MealAverage()
}
