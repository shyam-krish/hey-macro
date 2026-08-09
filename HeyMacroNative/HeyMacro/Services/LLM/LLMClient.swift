import Foundation

/// The one entry point screens use for LLM work — a port of `services/llm.ts`.
/// Selects a provider, builds prompts via `PromptFormatter`, decodes and normalizes responses.
struct LLMClient: Sendable {
    var provider: LLMProvider

    init(provider: LLMProvider? = nil) {
        self.provider = provider ?? Secrets.defaultProvider
    }

    private var service: any LLMProviding {
        switch provider {
        case .openai: OpenAIService()
        case .gemini, .gemini3: GeminiService()
        }
    }

    // MARK: - Food parsing

    /// Parses a transcript into the COMPLETE updated state of today's log (replace-all model:
    /// the "today so far" context is what preserves existing items).
    func parseFoodInput(
        transcript: String,
        currentTime: Date = Date(),
        todayLog: DailyLog?,
        previousDayLogs: [DailyLog] = [],
        enableWebSearch: Bool = true
    ) async throws -> ParsedDay {
        do {
            let request = LLMRequest(
                model: provider.defaultModel,
                messages: [
                    LLMMessage(role: .system, content: Prompts.foodParsing),
                    LLMMessage(role: .user, content: PromptFormatter.foodParsingUserPrompt(
                        transcript: transcript,
                        currentTime: currentTime,
                        todayLog: todayLog,
                        previousDayLogs: previousDayLogs
                    )),
                ],
                schema: .foodLog,
                webSearch: enableWebSearch && provider.supportsWebSearch,
                temperature: 0.3
            )
            let data = try await service.generateStructuredJSON(request)
            let raw = try JSONDecoder().decode(RawParsedDay.self, from: data)
            return try Self.normalize(raw)
        } catch {
            throw wrapped("Failed to parse food input", error)
        }
    }

    // MARK: - Recommendations

    /// Nutrition Q&A. `isValid == false` means the question was off-topic (caller shows a
    /// canned message). The answer comes back stripped of markdown/citations.
    func getRecommendation(
        question: String,
        conversationHistory: [LLMMessage] = [],
        currentTime: Date = Date(),
        todayLog: DailyLog,
        targets: MacroTargets,
        previousDayLogs: [DailyLog] = [],
        enableWebSearch: Bool = true
    ) async throws -> RecommendationResult {
        do {
            var messages: [LLMMessage] = [LLMMessage(role: .system, content: Prompts.recommendation)]
            messages.append(contentsOf: conversationHistory)
            messages.append(LLMMessage(role: .user, content: PromptFormatter.recommendationUserPrompt(
                question: question,
                currentTime: currentTime,
                todayLog: todayLog,
                targets: targets,
                previousDayLogs: previousDayLogs
            )))

            let request = LLMRequest(
                model: provider.defaultModel,
                messages: messages,
                schema: .recommendation,
                webSearch: enableWebSearch && provider.supportsWebSearch,
                temperature: 0.5
            )
            let data = try await service.generateStructuredJSON(request)
            let result = try JSONDecoder().decode(RecommendationResult.self, from: data)
            return RecommendationResult(
                isValid: result.isValid,
                answer: Self.sanitizeAnswer(result.answer)
            )
        } catch {
            throw wrapped("Failed to get recommendation", error)
        }
    }

    private func wrapped(_ prefix: String, _ error: Error) -> Error {
        NSError(
            domain: "LLMClient", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "\(prefix): \(error.localizedDescription)"]
        )
    }

    // MARK: - Normalization (port of validateAndNormalizeLLMResponse / validateFoodItem)

    struct RawParsedDay: Decodable {
        var breakfast: [RawFoodItem]?
        var lunch: [RawFoodItem]?
        var dinner: [RawFoodItem]?
        var snacks: [RawFoodItem]?
    }

    /// Lenient item: schema enforcement makes fields present for OpenAI strict mode, but Gemini
    /// can return doubles where we want ints, and belt-and-suspenders costs nothing.
    struct RawFoodItem: Decodable {
        var name: String?
        var quantity: String?
        var calories: Double?
        var protein: Double?
        var carbs: Double?
        var fat: Double?
    }

    static func normalize(_ raw: RawParsedDay) throws -> ParsedDay {
        ParsedDay(
            breakfast: try (raw.breakfast ?? []).map(normalizeItem),
            lunch: try (raw.lunch ?? []).map(normalizeItem),
            dinner: try (raw.dinner ?? []).map(normalizeItem),
            snacks: try (raw.snacks ?? []).map(normalizeItem)
        )
    }

    static func normalizeItem(_ item: RawFoodItem) throws -> ParsedFoodItem {
        guard let name = item.name, !name.isEmpty else {
            throw LLMError.invalidFoodItem("Food item must have a name")
        }
        // JS: `item.quantity || '1 serving'` — empty string is falsy too.
        let quantity = (item.quantity?.isEmpty == false) ? item.quantity! : "1 serving"
        return ParsedFoodItem(
            name: name,
            quantity: quantity,
            calories: Int((item.calories ?? 0).rounded()),
            protein: Int((item.protein ?? 0).rounded()),
            carbs: Int((item.carbs ?? 0).rounded()),
            fat: Int((item.fat ?? 0).rounded())
        )
    }

    // MARK: - Answer sanitization (port of the regex chain in getRecommendation)

    /// Strips markdown links, URLs, and bold markers; collapses whitespace runs.
    /// The system prompt forbids these, but models include them anyway when web search runs.
    static func sanitizeAnswer(_ answer: String) -> String {
        answer
            .replacingOccurrences(of: #"\[([^\]]*)\]\(https?://[^)]+\)"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\(https?://[^)]+\)"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"https?://\S+"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\*\*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
