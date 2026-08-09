import Foundation

/// Gemini `generateContent` via URLSession — a port of `services/gemini.ts`.
///
/// Ported behaviors:
/// - System messages are filtered out and concatenated into `systemInstruction`.
/// - `assistant` role maps to `model`.
/// - Structured output via `responseSchema` + `responseMimeType: application/json`.
/// - Gemini 3 models: `google_search` tool (when web search on) + `thinkingConfig.thinkingLevel`.
/// - Gemini 2.x models: `thinkingConfig.thinkingBudget` (low 256 / medium 512 / high 1024),
///   never web search (can't combine with structured output).
/// - Retry with backoff on network errors only: 3 retries, 2s/4s/8s.
struct GeminiService: LLMProviding {
    var apiKey: String = Secrets.geminiKey
    var session: URLSession = .llmSession

    static let maxRetries = 3

    func generateStructuredJSON(_ request: LLMRequest) async throws -> Data {
        guard !apiKey.isEmpty else { throw LLMError.missingAPIKey("Gemini") }

        var lastError: Error = LLMError.emptyResponse("Gemini request never ran")
        for attempt in 0...Self.maxRetries {
            do {
                return try await performRequest(request)
            } catch let error as URLError where Self.isRetryable(error) && attempt < Self.maxRetries {
                lastError = error
                // Backoff 2s, 4s, 8s — same as the RN INITIAL_RETRY_DELAY_MS * 2^attempt.
                try await Task.sleep(for: .seconds(2 * (1 << attempt)))
            } catch {
                throw error
            }
        }
        throw lastError
    }

    static func isRetryable(_ error: URLError) -> Bool {
        switch error.code {
        case .timedOut, .networkConnectionLost, .notConnectedToInternet,
             .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
            true
        default:
            false
        }
    }

    private func performRequest(_ request: LLMRequest) async throws -> Data {
        let isGemini3 = request.model.contains("gemini-3")

        var generationConfig: [String: Any] = [
            "temperature": request.temperature ?? 0.3,
            "responseMimeType": "application/json",
            "responseSchema": request.schema.geminiSchema,
        ]
        if isGemini3 {
            generationConfig["thinkingConfig"] = ["thinkingLevel": request.reasoningEffort.uppercased()]
        } else {
            generationConfig["thinkingConfig"] = [
                "thinkingBudget": Self.thinkingBudget(for: request.reasoningEffort),
                "includeThoughts": false,
            ]
        }

        let systemText = request.messages
            .filter { $0.role == .system }
            .map(\.content)
            .joined(separator: "\n\n")
        let contents = request.messages
            .filter { $0.role != .system }
            .map { message in
                [
                    "role": message.role == .assistant ? "model" : "user",
                    "parts": [["text": message.content]],
                ] as [String: Any]
            }

        var body: [String: Any] = [
            "contents": contents,
            "generationConfig": generationConfig,
        ]
        if !systemText.isEmpty {
            body["systemInstruction"] = ["parts": [["text": systemText]]]
        }
        if isGemini3 && request.webSearch {
            body["tools"] = [["google_search": [String: Any]()]]
        }

        let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(request.model):generateContent")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue(apiKey, forHTTPHeaderField: "x-goog-api-key")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: urlRequest)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw LLMError.httpError(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }

        return try Self.extractCandidateText(from: data)
    }

    /// Gemini 2.x thinking budgets, from the RN `getThinkingBudget` (default -1 = auto).
    static func thinkingBudget(for effort: String) -> Int {
        switch effort {
        case "low": 256
        case "medium": 512
        case "high": 1024
        default: -1
        }
    }

    static func extractCandidateText(from data: Data) throws -> Data {
        guard
            let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let candidate = (root["candidates"] as? [[String: Any]])?.first
        else {
            throw LLMError.emptyResponse("no candidates in Gemini response")
        }

        // finishReason mapping ported from gemini.ts response validation.
        let finishReason = candidate["finishReason"] as? String ?? "UNKNOWN"
        switch finishReason {
        case "STOP":
            break
        case "MAX_TOKENS":
            throw LLMError.truncated
        case "SAFETY", "RECITATION":
            throw LLMError.blocked(finishReason)
        default:
            throw LLMError.emptyResponse("Gemini finished with \(finishReason)")
        }

        let parts = (candidate["content"] as? [String: Any])?["parts"] as? [[String: Any]] ?? []
        let text = parts.compactMap { $0["text"] as? String }.joined()
        guard !text.isEmpty else {
            throw LLMError.emptyResponse("No response text from Gemini")
        }
        return Data(text.utf8)
    }
}
