import Foundation
import Observation
import OSLog

/// App-scoped state: owns the database, store, and LLM client; loads the user + global targets
/// once; tracks the canonical "today".
///
/// Replaces the RN `useAppData` initialization path. The per-day state (selected date, log,
/// logging pipeline) lives in `DayModel`.
@Observable @MainActor
final class AppModel {
    private(set) var store: DataStore?
    let llm = LLMClient()

    private(set) var user: User?
    var targets: MacroTargets?
    private(set) var today: LocalDate = .today()
    private(set) var bootError: String?

    var isReady: Bool { store != nil && user != nil && targets != nil }

    private static let log = Logger(subsystem: "com.anonymous.hey-macro", category: "AppModel")

    /// Opens (adopting the RN database if present), migrates, and loads user + targets.
    func bootstrap() async {
        guard store == nil else { return }
        do {
            let database = try AppDatabase.makeShared()
            let store = DataStore(database)

            #if DEBUG
            if CommandLine.arguments.contains("-seedDemoData") {
                try await SeedData.seed(into: store)
            }
            #endif

            self.user = try await store.getOrCreateDefaultUser()
            self.targets = try await store.getOrCreateMacroTargets(userID: DataStore.defaultUserID)
            self.store = store
        } catch {
            Self.log.error("Bootstrap failed: \(error.localizedDescription, privacy: .public)")
            bootError = error.localizedDescription
        }
    }

    /// Recomputes "today" — called on scene activation and calendar-day change.
    /// (The RN app never did this; it showed yesterday as "today" across midnight.)
    /// Returns true if the day rolled over.
    func refreshToday() -> Bool {
        let current = LocalDate.today()
        guard current != today else { return false }
        today = current
        return true
    }

    func updateUser(firstName: String, lastName: String) async throws {
        guard let store else { return }
        user = try await store.updateUser(
            userID: DataStore.defaultUserID, firstName: firstName, lastName: lastName
        )
    }

    func updateTargets(calories: Int, protein: Int, carbs: Int, fat: Int) async throws {
        guard let store else { return }
        targets = try await store.updateMacroTargets(
            userID: DataStore.defaultUserID,
            calories: calories, protein: protein, carbs: carbs, fat: fat
        )
    }
}
