import SwiftUI

enum Route: Hashable {
    case trends
    case profile
}

/// Boot gate + navigation shell. Mirrors App.tsx: full-black loading screen until the DB and
/// user/targets are ready, then the Home stack (headers hidden, screens draw their own top bars).
struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ZStack {
            Theme.Colors.background.ignoresSafeArea()

            if let store = app.store, app.isReady {
                HomeContainer(store: store, llm: app.llm)
            } else if let error = app.bootError {
                Text("Error: \(error)")
                    .font(Theme.Fonts.ui(16))
                    .foregroundStyle(Theme.Colors.error)
                    .padding(Theme.Spacing.sheetPadding)
            } else {
                VStack(spacing: 16) {
                    ProgressView()
                        .controlSize(.large)
                        .tint(.white)
                    Text("Loading...")
                        .font(Theme.Fonts.ui(16))
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
        }
        .task { await app.bootstrap() }
    }
}

/// Owns the DayModel (created once the store exists) and the navigation stack.
private struct HomeContainer: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    @State private var day: DayModel
    @State private var path: [Route] = []

    init(store: DataStore, llm: LLMClient) {
        _day = State(initialValue: DayModel(store: store, llm: llm))
    }

    var body: some View {
        NavigationStack(path: $path) {
            HomeScreen(navigate: { path.append($0) })
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .trends: TrendsScreen()
                    case .profile: ProfileScreen()
                    }
                }
                .toolbar(.hidden, for: .navigationBar)
        }
        .environment(day)
        .task {
            await day.load()
            #if DEBUG
            // `simctl launch ... -autoLogFood "2 eggs and toast"` drives the full
            // parse→save pipeline without needing keyboard input in the simulator.
            if let transcript = UserDefaults.standard.string(forKey: "autoLogFood") {
                day.submitFood(transcript)
            }
            #endif
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                let wasViewingToday = day.isToday
                if app.refreshToday() {
                    Task { await day.handleDayRollover(newToday: app.today, wasViewingToday: wasViewingToday) }
                }
            case .background, .inactive:
                // Produces the specific "keep the app open while processing" error message.
                if case .processing = day.phase {
                    day.wasBackgroundedDuringProcessing = true
                }
            @unknown default:
                break
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in
            let wasViewingToday = day.isToday
            if app.refreshToday() {
                Task { await day.handleDayRollover(newToday: app.today, wasViewingToday: wasViewingToday) }
            }
        }
    }
}
