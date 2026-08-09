import Foundation

/// OpenAI Responses API via plain URLSession (no SDK).
///
/// Mirrors the RN `services/openai.ts` call: strict JSON-schema structured output,
/// `web_search_preview` tool when enabled, reasoning effort forwarded, and — deliberately —
/// NO temperature (the RN OpenAI path never forwarded it; reasoning models reject it).
/// Single attempt, no retry (also matches RN).
struct OpenAIService: LLMProviding {
    var apiKey: String = Secrets.openAIKey
    var session: URLSession = .llmSession

    func generateStructuredJSON(_ request: LLMRequest) async throws -> Data {
        guard !apiKey.isEmpty else { throw LLMError.missingAPIKey("OpenAI") }

        var body: [String: Any] = [
            "model": request.model,
            "input": request.messages.map { ["role": $0.role.rawValue, "content": $0.content] },
            "text": [
                "format": [
                    "type": "json_schema",
                    "name": request.schema.name,
                    "strict": true,
                    "schema": request.schema.openAISchema,
                ] as [String: Any],
            ],
            "reasoning": ["effort": request.reasoningEffort],
        ]
        if request.webSearch {
            body["tools"] = [["type": "web_search_preview"]]
        }

        var urlRequest = URLRequest(url: URL(string: "https://api.openai.com/v1/responses")!)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: urlRequest)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw LLMError.httpError(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }

        return try Self.extractOutputText(from: data)
    }

    /// Pulls the structured-output text out of a Responses API payload:
    /// `output[] → type == "message" → content[] → type == "output_text" → text`.
    static func extractOutputText(from data: Data) throws -> Data {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw LLMError.emptyResponse("unparseable OpenAI response")
        }

        if let status = root["status"] as? String, status == "incomplete" {
            let reason = (root["incomplete_details"] as? [String: Any])?["reason"] as? String
            if reason == "max_output_tokens" { throw LLMError.truncated }
            throw LLMError.emptyResponse("response incomplete: \(reason ?? "unknown")")
        }

        var texts: [String] = []
        for item in root["output"] as? [[String: Any]] ?? [] {
            guard item["type"] as? String == "message" else { continue }
            for content in item["content"] as? [[String: Any]] ?? [] {
                switch content["type"] as? String {
                case "output_text":
                    if let text = content["text"] as? String { texts.append(text) }
                case "refusal":
                    throw LLMError.blocked(content["refusal"] as? String ?? "model refused")
                default:
                    break
                }
            }
        }

        let joined = texts.joined()
        guard !joined.isEmpty else {
            throw LLMError.emptyResponse("No parsed output from OpenAI")
        }
        return Data(joined.utf8)
    }
}

extension URLSession {
    /// Web-search-grounded parsing can run long; the RN app allowed 5 minutes.
    static let llmSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300
        config.timeoutIntervalForResource = 300
        return URLSession(configuration: config)
    }()
}
