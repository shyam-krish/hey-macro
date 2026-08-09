import Foundation

/// One food item as returned by the LLM (mirrors the TS `FoodItem` / Zod `FoodItemSchema`).
struct ParsedFoodItem: Codable, Sendable, Equatable {
    var name: String
    var quantity: String
    var calories: Int
    var protein: Int
    var carbs: Int
    var fat: Int
}

/// The complete desired state of a day as returned by the LLM (mirrors the TS `LLMResponse`).
/// This is a replace-all payload: `DataStore.replaceDailyFoodEntries` deletes the day's entries
/// and re-inserts exactly this.
struct ParsedDay: Codable, Sendable, Equatable {
    var breakfast: [ParsedFoodItem]
    var lunch: [ParsedFoodItem]
    var dinner: [ParsedFoodItem]
    var snacks: [ParsedFoodItem]

    static let empty = ParsedDay(breakfast: [], lunch: [], dinner: [], snacks: [])

    func items(for meal: MealType) -> [ParsedFoodItem] {
        switch meal {
        case .breakfast: breakfast
        case .lunch: lunch
        case .dinner: dinner
        case .snacks: snacks
        }
    }

    var allItems: [ParsedFoodItem] { breakfast + lunch + dinner + snacks }
}
