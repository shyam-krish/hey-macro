import SwiftUI

/// The main screen: summary ring + macro bars, weight card, meal cards, floating status /
/// chat overlays, and the input bar. Date changes slide the content horizontally in the
/// direction of travel (RN parity).
struct HomeScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(DayModel.self) private var day

    var navigate: (Route) -> Void

    @State private var inputText = ""
    @State private var showCalendar = false
    @State private var showWeightSheet = false
    @State private var selectedMeal: MealType?
    @State private var voice = VoiceInput()

    var body: some View {
        @Bindable var day = day

        VStack(spacing: 0) {
            TopBar(onCalendarTap: { showCalendar = true }, navigate: navigate)
                .popover(isPresented: $showCalendar, arrowEdge: .top) {
                    CalendarPopover(anchor: day.selectedDate)
                        .presentationCompactAdaptation(.popover)
                }

            content
        }
        .background(Theme.Colors.background)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 10) {
                StatusIndicatorCard()
                if day.isAskMode {
                    RecommendationChat()
                }
                InputBar(
                    text: $inputText,
                    voiceEnabled: voice.isAvailable,
                    isRecording: voice.isRecording,
                    isPreparingVoice: voice.isPreparing,
                    liveTranscript: voice.liveTranscript,
                    onMicTap: handleMicTap
                )
            }
        }
        .overlay(alignment: .top) {
            if let chatError = day.chatError {
                ErrorToast(message: chatError) { day.chatError = nil }
                    .padding(.top, 8)
            }
        }
        .sheet(isPresented: $showWeightSheet) {
            WeightInputSheet(
                initialWeight: day.dayWeight?.weight,
                previousWeight: day.previousWeight?.weight
            ) { weight in
                Task { await day.saveWeight(weight) }
            }
        }
        .sheet(item: $selectedMeal) { meal in
            MealDetailSheet(meal: meal)
        }
    }

    @ViewBuilder
    private var content: some View {
        if let log = day.log {
            ScrollView {
                VStack(spacing: 20) {
                    summarySection(log)
                    WeightCard(weight: day.dayWeight?.weight) { showWeightSheet = true }
                    FoodSection(log: log) { meal in selectedMeal = meal }
                }
                .padding(.horizontal, Theme.Spacing.screenPadding)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.immediately)
            .id(day.selectedDate)
            .transition(slideTransition)
            .animation(.easeOut(duration: 0.3), value: day.selectedDate)
        } else if let error = day.loadError {
            Spacer()
            Text("Error: \(error)")
                .font(Theme.Fonts.ui(16))
                .foregroundStyle(Theme.Colors.error)
            Spacer()
        } else {
            Spacer()
            ProgressView().controlSize(.large).tint(.white)
            Spacer()
        }
    }

    private func summarySection(_ log: DailyLog) -> some View {
        HStack(alignment: .center, spacing: 20) {
            CalorieRing(
                current: log.totalCalories,
                target: log.targetCalories,
                isToday: day.isToday
            )

            VStack(spacing: 14) {
                MacroProgressBar(label: "Protein", current: log.totalProtein, target: log.targetProtein)
                MacroProgressBar(label: "Carbohydrates", current: log.totalCarbs, target: log.targetCarbs)
                MacroProgressBar(label: "Fat", current: log.totalFat, target: log.targetFat)
            }
        }
        .padding(.bottom, 20)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.Colors.track).frame(height: 0.5)
        }
    }

    /// Tap-to-start / tap-to-stop. Stopping routes the transcript into the same submit paths
    /// as text; nothing heard → silent reset (RN behavior).
    private func handleMicTap() {
        Task {
            if voice.isRecording {
                day.setRecording(false)
                if let transcript = await voice.stop() {
                    if day.isAskMode {
                        day.askRecommendation(transcript)
                    } else {
                        day.submitFood(transcript)
                    }
                }
            } else {
                inputText = ""
                do {
                    try await voice.start()
                    if voice.isRecording {
                        day.setRecording(true)
                    } else if voice.isDenied {
                        day.reportVoiceError("Microphone access denied. Enable it in Settings.")
                    }
                } catch {
                    day.reportVoiceError(error.localizedDescription)
                }
            }
        }
    }

    private var slideTransition: AnyTransition {
        switch day.slideDirection {
        case .none:
            return .opacity
        case .forward:
            return .asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            )
        case .backward:
            return .asymmetric(
                insertion: .move(edge: .leading).combined(with: .opacity),
                removal: .move(edge: .trailing).combined(with: .opacity)
            )
        }
    }
}

extension MealType: Identifiable {
    var id: String { rawValue }
}
