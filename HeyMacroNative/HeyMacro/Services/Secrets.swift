import Foundation

/// API keys and provider selection, injected at build time:
/// Config/Secrets.xcconfig → build settings → Info.plist `$(VAR)` substitution → here.
enum Secrets {
    static var openAIKey: String { infoValue("OPENAI_API_KEY") }
    static var geminiKey: String { infoValue("GEMINI_API_KEY") }

    static var defaultProvider: LLMProvider {
        LLMProvider(rawValue: infoValue("LLM_PROVIDER")) ?? .openai
    }

    private static func infoValue(_ key: String) -> String {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? ""
    }
}
