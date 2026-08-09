import Foundation

/// Mirrors the TS `ProviderType`. `gemini` and `gemini3` share one service, different models
/// (and `gemini` 2.5 cannot combine web search with structured output).
enum LLMProvider: String, Sendable {
    case openai
    case gemini
    case gemini3

    var supportsWebSearch: Bool { self != .gemini }

    var defaultModel: String {
        switch self {
        case .openai: "gpt-5.4-mini-2026-03-17"
        case .gemini: "gemini-2.5-flash"
        case .gemini3: "gemini-3-flash-preview"
        }
    }
}

struct LLMMessage: Sendable, Equatable {
    enum Role: String, Sendable {
        case system, user, assistant
    }

    var role: Role
    var content: String
}

/// Provider-agnostic request. Each service maps `schema` to its own wire format.
struct LLMRequest: Sendable {
    var model: String
    var messages: [LLMMessage]
    var schema: StructuredSchema
    var webSearch: Bool
    var reasoningEffort: String = "low"
    var temperature: Double?
}

/// The two structured-output shapes the app uses. Schema dictionaries live here so both
/// providers derive from one source of truth (descriptions ported from llmTypes.ts).
enum StructuredSchema: Sendable {
    case foodLog
    case recommendation

    var name: String {
        switch self {
        case .foodLog: "food_log_response"
        case .recommendation: "recommendation_response"
        }
    }

    /// JSON Schema for OpenAI strict structured outputs: every object must list all keys in
    /// `required` and set `additionalProperties: false`, or the API rejects the request.
    var openAISchema: [String: Any] {
        switch self {
        case .foodLog:
            let item: [String: Any] = [
                "type": "object",
                "properties": [
                    "name": ["type": "string", "description": "Name of the food item"],
                    "quantity": ["type": "string", "description": #"Descriptive quantity (e.g., "3 large", "1 cup", "150g")"#],
                    "calories": ["type": "number", "description": "Total calories in kcal"],
                    "protein": ["type": "number", "description": "Protein in grams"],
                    "carbs": ["type": "number", "description": "Carbohydrates in grams"],
                    "fat": ["type": "number", "description": "Fat in grams"],
                ],
                "required": ["name", "quantity", "calories", "protein", "carbs", "fat"],
                "additionalProperties": false,
            ]
            func meal(_ description: String) -> [String: Any] {
                ["type": "array", "items": item, "description": description]
            }
            return [
                "type": "object",
                "properties": [
                    "breakfast": meal("Food items for breakfast"),
                    "lunch": meal("Food items for lunch"),
                    "dinner": meal("Food items for dinner"),
                    "snacks": meal("Food items for snacks"),
                ],
                "required": ["breakfast", "lunch", "dinner", "snacks"],
                "additionalProperties": false,
            ]
        case .recommendation:
            return [
                "type": "object",
                "properties": [
                    "isValid": [
                        "type": "boolean",
                        "description": "True if the question is related to food, nutrition, or macros. False otherwise.",
                    ],
                    "answer": [
                        "type": "string",
                        "description": "Direct, actionable answer to the nutrition question. Empty string if isValid is false.",
                    ],
                ],
                "required": ["isValid", "answer"],
                "additionalProperties": false,
            ]
        }
    }

    /// Gemini `responseSchema` format (uppercase types + propertyOrdering) — the shape the RN
    /// `zodToGeminiSchema` converter produced.
    var geminiSchema: [String: Any] {
        switch self {
        case .foodLog:
            let item: [String: Any] = [
                "type": "OBJECT",
                "properties": [
                    "name": ["type": "STRING", "description": "Name of the food item"],
                    "quantity": ["type": "STRING", "description": #"Descriptive quantity (e.g., "3 large", "1 cup", "150g")"#],
                    "calories": ["type": "NUMBER", "description": "Total calories in kcal"],
                    "protein": ["type": "NUMBER", "description": "Protein in grams"],
                    "carbs": ["type": "NUMBER", "description": "Carbohydrates in grams"],
                    "fat": ["type": "NUMBER", "description": "Fat in grams"],
                ],
                "required": ["name", "quantity", "calories", "protein", "carbs", "fat"],
                "propertyOrdering": ["name", "quantity", "calories", "protein", "carbs", "fat"],
            ]
            func meal() -> [String: Any] { ["type": "ARRAY", "items": item] }
            return [
                "type": "OBJECT",
                "properties": [
                    "breakfast": meal(), "lunch": meal(), "dinner": meal(), "snacks": meal(),
                ],
                "required": ["breakfast", "lunch", "dinner", "snacks"],
                "propertyOrdering": ["breakfast", "lunch", "dinner", "snacks"],
            ]
        case .recommendation:
            return [
                "type": "OBJECT",
                "properties": [
                    "isValid": ["type": "BOOLEAN", "description": "True if the question is related to food, nutrition, or macros. False otherwise."],
                    "answer": ["type": "STRING", "description": "Direct, actionable answer to the nutrition question. Empty string if isValid is false."],
                ],
                "required": ["isValid", "answer"],
                "propertyOrdering": ["isValid", "answer"],
            ]
        }
    }
}

/// A provider turns a request into the raw JSON text of the structured output.
/// `LLMClient` owns decoding/normalization.
protocol LLMProviding: Sendable {
    func generateStructuredJSON(_ request: LLMRequest) async throws -> Data
}

struct RecommendationResult: Codable, Sendable, Equatable {
    var isValid: Bool
    var answer: String
}

enum LLMError: LocalizedError {
    case missingAPIKey(String)
    case httpError(status: Int, body: String)
    case emptyResponse(String)
    case truncated
    case blocked(String)
    case invalidFoodItem(String)

    var errorDescription: String? {
        switch self {
        case .missingAPIKey(let provider):
            "Missing API key for \(provider). Check Config/Secrets.xcconfig."
        case .httpError(let status, let body) where status == 401 || status == 403:
            "Invalid API key (HTTP \(status)): \(body)"
        case .httpError(let status, let body):
            "HTTP \(status): \(body)"
        case .emptyResponse(let detail):
            "Empty response: \(detail)"
        case .truncated:
            "Response was truncated (hit max output tokens)"
        case .blocked(let reason):
            "Response blocked: \(reason)"
        case .invalidFoodItem(let detail):
            detail
        }
    }
}
