import Foundation

/// Raw values match the `mealType` column and the LLM response keys exactly.
enum MealType: String, Codable, CaseIterable, Sendable {
    case breakfast
    case lunch
    case dinner
    case snacks

    var displayName: String {
        switch self {
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .snacks: "Snacks"
        }
    }
}
