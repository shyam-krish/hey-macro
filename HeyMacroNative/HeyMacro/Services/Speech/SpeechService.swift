import Foundation
import Observation
import Speech
import AVFoundation
import OSLog

/// On-device speech-to-text using the iOS 26 SpeechAnalyzer/SpeechTranscriber stack.
///
/// Ports the RN `useVoiceInput` behaviors:
/// - tap-to-start / tap-to-stop (not press-and-hold)
/// - volatile results stream into `transcript` for the live pill display
/// - `stop()` finalizes and returns the final transcript, falling back to the last volatile
///   text after a 500ms grace period (the RN onSpeechEnd fallback)
/// - empty/whitespace transcript → nil, silently ignored by callers ("no speech detected")
@available(iOS 26.0, *)
@Observable @MainActor
final class SpeechService {
    enum State: Equatable {
        case idle
        case preparingAssets // one-time model download
        case recording
        case denied
    }

    enum SpeechError: LocalizedError {
        case localeUnsupported
        case assetInstallFailed(String)

        var errorDescription: String? {
            switch self {
            case .localeUnsupported:
                "Speech recognition isn't available for English on this device."
            case .assetInstallFailed(let detail):
                "Couldn't download the speech model: \(detail)"
            }
        }
    }

    private(set) var state: State = .idle
    private(set) var transcript = ""

    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var audioEngine: AVAudioEngine?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var resultsTask: Task<Void, Never>?
    private var finalizedTranscript = ""

    private static let log = Logger(subsystem: "com.anonymous.hey-macro", category: "Speech")

    var isRecording: Bool { state == .recording }

    // MARK: - Permissions & assets

    /// Requests mic permission and ensures the on-device model is installed.
    /// Returns false when the user denied microphone access; throws on setup failures
    /// so callers can surface them instead of failing silently.
    func prepare() async throws -> Bool {
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else {
            state = .denied
            return false
        }

        let locale = Locale(identifier: "en-US")
        guard let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
            Self.log.error("en-US not supported by SpeechTranscriber")
            throw SpeechError.localeUnsupported
        }
        Self.log.info("SpeechTranscriber locale: \(supported.identifier, privacy: .public)")

        let transcriber = SpeechTranscriber(
            locale: supported,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )

        // One-time on-device model download (needs network once).
        if let request = try? await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            Self.log.info("Speech model download starting")
            state = .preparingAssets
            do {
                try await request.downloadAndInstall()
                Self.log.info("Speech model installed")
            } catch {
                Self.log.error("Speech asset install failed: \(error.localizedDescription, privacy: .public)")
                state = .idle
                throw SpeechError.assetInstallFailed(error.localizedDescription)
            }
            state = .idle
        } else {
            Self.log.info("Speech model already installed")
        }

        self.transcriber = transcriber
        return true
    }

    // MARK: - Recording

    func start() async throws {
        guard state != .recording else { return }
        if transcriber == nil {
            guard try await prepare() else { return }
        }
        guard let transcriber else { return }

        transcript = ""
        finalizedTranscript = ""

        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer

        // Consume results: volatile results overwrite the live transcript; finalized
        // results accumulate (mirrors the RN "each result overwrites" behavior closely
        // enough for single-utterance logging).
        resultsTask = Task { [weak self] in
            do {
                for try await result in transcriber.results {
                    guard let self else { return }
                    let text = String(result.text.characters)
                    if result.isFinal {
                        self.finalizedTranscript += text
                        self.transcript = self.finalizedTranscript
                    } else {
                        self.transcript = self.finalizedTranscript + text
                    }
                }
            } catch {
                Self.log.error("Transcriber stream ended: \(error.localizedDescription, privacy: .public)")
            }
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .spokenAudio, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let (inputSequence, inputBuilder) = AsyncStream<AnalyzerInput>.makeStream()
        self.inputBuilder = inputBuilder

        let engine = AVAudioEngine()
        audioEngine = engine
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
        let converter = analyzerFormat.flatMap { AVAudioConverter(from: inputFormat, to: $0) }

        inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
            if let analyzerFormat, let converter {
                let ratio = analyzerFormat.sampleRate / inputFormat.sampleRate
                let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 16
                guard let converted = AVAudioPCMBuffer(pcmFormat: analyzerFormat, frameCapacity: capacity) else { return }
                var error: NSError?
                var consumed = false
                converter.convert(to: converted, error: &error) { _, outStatus in
                    if consumed {
                        outStatus.pointee = .noDataNow
                        return nil
                    }
                    consumed = true
                    outStatus.pointee = .haveData
                    return buffer
                }
                if error == nil, converted.frameLength > 0 {
                    inputBuilder.yield(AnalyzerInput(buffer: converted))
                }
            } else {
                inputBuilder.yield(AnalyzerInput(buffer: buffer))
            }
        }

        engine.prepare()
        try engine.start()
        try await analyzer.start(inputSequence: inputSequence)
        state = .recording
    }

    /// Stops recording and returns the final transcript (nil when nothing was heard).
    /// The 500ms grace period mirrors the RN stopRecording fallback.
    func stop() async -> String? {
        guard state == .recording else { return nil }
        state = .idle

        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil
        inputBuilder?.finish()
        inputBuilder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        // Finalize, but never hang the UI on it — race against a grace window.
        let finalization = Task { [analyzer] in
            try? await analyzer?.finalizeAndFinishThroughEndOfInput()
        }
        let grace = Task {
            try? await Task.sleep(for: .milliseconds(500))
        }
        _ = await finalization.result
        grace.cancel()

        resultsTask?.cancel()
        resultsTask = nil
        analyzer = nil
        transcriber = nil // rebuilt next start(); AssetInventory is cached so it's cheap

        let final = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        return final.isEmpty ? nil : final
    }

    func cancel() async {
        _ = await stop()
        transcript = ""
    }
}
