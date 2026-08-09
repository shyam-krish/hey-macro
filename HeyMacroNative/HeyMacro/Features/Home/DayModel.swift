import Foundation
import Observation

/// State for the Home screen: the selected day's log/weight, the logging pipeline, and the
/// recommendation chat. Ports the combination of `useAppData` (per-date state),
/// `useVoiceFoodLogger` (parse → save pipeline), and HomeScreen's local state.
///
/// Deliberate divergence from RN: no ±7-day prefetch cache — GRDB reads are local and
/// microsecond-fast, so each date change just loads directly.
@Observable @MainActor
final class DayModel {
    enum Phase: Equatable {
        case idle
        case recording
        case processing(transcript: String)
        case saving
        case error(String)

        var isBusy: Bool {
            switch self {
            case .processing, .saving, .recording: true
            case .idle, .error: false
            }
        }
    }

    enum SlideDirection {
        case none, forward, backward
    }

    struct ChatMessage: Identifiable, Equatable {
        enum Role { case user, assistant }
        let id = UUID()
        let role: Role
        var text: String
    }

    private let store: DataStore
    private let llm: LLMClient
    private let userID = DataStore.defaultUserID

    // Day state
    private(set) var selectedDate: LocalDate
    private(set) var log: DailyLog?
    private(set) var dayWeight: WeightLog?
    private(set) var previousWeight: WeightLog?
    private(set) var slideDirection: SlideDirection = .none
    private(set) var loadError: String?

    // Logging pipeline
    private(set) var phase: Phase = .idle
    private var pipelineTask: Task<Void, Never>?
    /// Set by the scene-phase observer; produces the specific "keep the app open" error.
    var wasBackgroundedDuringProcessing = false

    // Recommendation chat
    var isAskMode = false
    private(set) var chat: [ChatMessage] = []
    private(set) var isAnsweringChat = false
    var chatError: String?
    private var chatTask: Task<Void, Never>?

    var isToday: Bool { selectedDate == .today() }

    init(store: DataStore, llm: LLMClient, date: LocalDate = .today()) {
        self.store = store
        self.llm = llm
        self.selectedDate = date
    }

    // MARK: - Day loading

    func load() async {
        do {
            log = try await store.getOrCreateDailyLog(userID: userID, date: selectedDate)
            dayWeight = try await store.getWeightLog(userID: userID, date: selectedDate)
            previousWeight = try await store.getPreviousWeightLog(userID: userID, before: selectedDate)
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    func changeDate(to date: LocalDate) async {
        guard date != selectedDate else { return }
        slideDirection = date > selectedDate ? .forward : .backward
        selectedDate = date
        await load()
    }

    func refresh() async {
        await load()
    }

    /// Re-anchor to a new "today" after midnight rollover (only if the user was viewing today).
    func handleDayRollover(newToday: LocalDate, wasViewingToday: Bool) async {
        if wasViewingToday {
            await changeDate(to: newToday)
        }
    }

    // MARK: - Entry editing (meal detail sheet)

    func updateEntry(_ foodEntryID: String, updates: DataStore.FoodEntryUpdates) async throws {
        try await store.updateFoodEntry(foodEntryID: foodEntryID, updates: updates)
        await load()
    }

    func deleteEntry(_ foodEntryID: String) async throws {
        try await store.deleteFoodEntry(foodEntryID: foodEntryID)
        await load()
    }

    // MARK: - Weight

    func saveWeight(_ weight: Double) async {
        do {
            dayWeight = try await store.saveWeightLog(userID: userID, date: selectedDate, weight: weight)
        } catch {
            loadError = error.localizedDescription
        }
    }

    // MARK: - Food logging pipeline (text + voice transcripts share this path)

    /// Parse the transcript into the complete updated day, then replace-save.
    /// Mirrors the RN behavior of operating on the *selected* day's log with the current time.
    func submitFood(_ transcript: String) {
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !phase.isBusy, let currentLog = log else { return }

        wasBackgroundedDuringProcessing = false
        phase = .processing(transcript: trimmed)

        pipelineTask = Task {
            do {
                let previousDays = try await store.getPreviousDaysLogs(userID: userID, days: 7)
                let parsed = try await llm.parseFoodInput(
                    transcript: trimmed,
                    todayLog: currentLog,
                    previousDayLogs: previousDays
                )
                guard !Task.isCancelled else { return }

                phase = .saving
                try await store.replaceDailyFoodEntries(
                    userID: userID, dailyLogID: currentLog.dailyLogID, with: parsed
                )
                await load()
                guard !Task.isCancelled else { return }
                Haptics.success()
                phase = .idle
            } catch is CancellationError {
                phase = .idle
            } catch {
                guard !Task.isCancelled else {
                    phase = .idle
                    return
                }
                Haptics.error()
                phase = .error(errorMessage(for: error))
            }
        }
    }

    /// The RN app surfaces a specific message when iOS killed the request because the app
    /// was backgrounded mid-processing.
    private func errorMessage(for error: Error) -> String {
        if wasBackgroundedDuringProcessing {
            return "Request failed because app was backgrounded. Keep the app open while processing."
        }
        return error.localizedDescription
    }

    func cancelProcessing() {
        pipelineTask?.cancel()
        pipelineTask = nil
        if case .processing = phase { phase = .idle }
    }

    func dismissError() {
        if case .error = phase { phase = .idle }
    }

    func setRecording(_ recording: Bool) {
        if recording {
            phase = .recording
        } else if case .recording = phase {
            phase = .idle
        }
    }

    func reportVoiceError(_ message: String) {
        Haptics.error()
        phase = .error(message)
    }

    // MARK: - Recommendation chat

    func askRecommendation(_ question: String) {
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isAnsweringChat, let currentLog = log else { return }
        guard let targets = currentTargets else { return }

        chat.append(ChatMessage(role: .user, text: trimmed))
        isAnsweringChat = true
        chatError = nil

        chatTask = Task {
            do {
                let previousDays = try await store.getPreviousDaysLogs(userID: userID, days: 7)
                let history = chat.dropLast().map { message in
                    LLMMessage(
                        role: message.role == .user ? .user : .assistant,
                        content: message.text
                    )
                }
                let result = try await llm.getRecommendation(
                    question: trimmed,
                    conversationHistory: Array(history),
                    todayLog: currentLog,
                    targets: targets,
                    previousDayLogs: previousDays
                )
                guard !Task.isCancelled else { return }
                let text = result.isValid ? result.answer : "Sorry I didn't get that. Try again."
                chat.append(ChatMessage(role: .assistant, text: text))
            } catch is CancellationError {
                // dropped silently; the pending user message is removed below
                if chat.last?.role == .user { chat.removeLast() }
            } catch {
                guard !Task.isCancelled else { return }
                // RN pops the unanswered user message and shows a toast.
                if chat.last?.role == .user { chat.removeLast() }
                chatError = error.localizedDescription
            }
            isAnsweringChat = false
        }
    }

    func clearChat() {
        chatTask?.cancel()
        chat = []
        isAnsweringChat = false
        chatError = nil
    }

    /// Targets for the recommendation context — the selected day's snapshot, falling back to
    /// zeroed targets never happens in practice (log always exists by the time chat is usable).
    private var currentTargets: MacroTargets? {
        guard let log else { return nil }
        return MacroTargets(
            userID: userID,
            calories: log.targetCalories, protein: log.targetProtein,
            carbs: log.targetCarbs, fat: log.targetFat,
            createdAt: "", updatedAt: ""
        )
    }
}
