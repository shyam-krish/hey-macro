import Foundation
import Observation

/// Availability-erased wrapper around `SpeechService` so views can reference voice
/// unconditionally while the temporary iOS-18 dev loop still compiles. On the shipping
/// iOS 26 target the #available branches are always taken.
///
/// On the SIMULATOR, `SpeechTranscriber` cannot install its speech model ("not subscribed
/// to transcription.en"), so DEBUG simulator builds fake a transcript instead: tapping the
/// mic types out a canned utterance word-by-word, and stop feeds it into the real
/// parse → save pipeline. Device builds are untouched by this.
@Observable @MainActor
final class VoiceInput {
    private var serviceStorage: Any?

    #if targetEnvironment(simulator) && DEBUG
    private static let fakeUtterance = "I had a turkey sandwich and an apple for lunch"
    private var fakeRecording = false
    private var fakeTranscript = ""
    private var typingTask: Task<Void, Never>?
    #endif

    @available(iOS 26.0, *)
    private var service: SpeechService {
        if let existing = serviceStorage as? SpeechService { return existing }
        let created = SpeechService()
        serviceStorage = created
        return created
    }

    var isAvailable: Bool {
        #if targetEnvironment(simulator) && DEBUG
        return true
        #else
        if #available(iOS 26.0, *) { return true } else { return false }
        #endif
    }

    var isRecording: Bool {
        #if targetEnvironment(simulator) && DEBUG
        return fakeRecording
        #else
        if #available(iOS 26.0, *) { return service.isRecording } else { return false }
        #endif
    }

    var isPreparing: Bool {
        #if targetEnvironment(simulator) && DEBUG
        return false
        #else
        if #available(iOS 26.0, *) { return service.state == .preparingAssets } else { return false }
        #endif
    }

    var isDenied: Bool {
        #if targetEnvironment(simulator) && DEBUG
        return false
        #else
        if #available(iOS 26.0, *) { return service.state == .denied } else { return false }
        #endif
    }

    var liveTranscript: String {
        #if targetEnvironment(simulator) && DEBUG
        return fakeTranscript
        #else
        if #available(iOS 26.0, *) { return service.transcript } else { return "" }
        #endif
    }

    func start() async throws {
        #if targetEnvironment(simulator) && DEBUG
        fakeTranscript = ""
        fakeRecording = true
        typingTask = Task { [weak self] in
            for word in Self.fakeUtterance.split(separator: " ") {
                try? await Task.sleep(for: .milliseconds(350))
                guard let self, self.fakeRecording, !Task.isCancelled else { return }
                self.fakeTranscript += self.fakeTranscript.isEmpty ? String(word) : " \(word)"
            }
        }
        #else
        guard #available(iOS 26.0, *) else { return }
        try await service.start()
        #endif
    }

    /// nil = nothing heard (silently ignored, RN behavior).
    func stop() async -> String? {
        #if targetEnvironment(simulator) && DEBUG
        typingTask?.cancel()
        typingTask = nil
        fakeRecording = false
        let transcript = fakeTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        fakeTranscript = ""
        return transcript.isEmpty ? nil : transcript
        #else
        guard #available(iOS 26.0, *) else { return nil }
        return await service.stop()
        #endif
    }

    func cancel() async {
        #if targetEnvironment(simulator) && DEBUG
        typingTask?.cancel()
        typingTask = nil
        fakeRecording = false
        fakeTranscript = ""
        #else
        guard #available(iOS 26.0, *) else { return }
        await service.cancel()
        #endif
    }
}
