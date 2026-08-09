import SwiftUI

/// iMessage-style input bar: "?" ask-mode toggle, text pill, and a context-dependent right
/// button (send when there's text, mic otherwise, stop while recording).
///
/// Hidden while processing/saving; visible while recording, with the pill showing the live
/// "Listening" state and a red stop button on the right (RN behavior).
struct InputBar: View {
    @Environment(DayModel.self) private var day
    @Binding var text: String
    @FocusState private var focused: Bool

    var voiceEnabled: Bool = false
    var isRecording: Bool = false
    var isPreparingVoice: Bool = false
    var liveTranscript: String = ""
    var onMicTap: () -> Void = {}

    @Namespace private var glassNamespace

    private var hidden: Bool {
        switch day.phase {
        case .processing, .saving: true
        default: false
        }
    }

    var body: some View {
        if !hidden {
            // One container so the mic/send/stop swap morphs between glass shapes.
            // Blend spacing stays below the HStack gap so the pill and buttons render as
            // separate floating glass pieces instead of coalescing into one blob.
            GlassEffectContainer(spacing: 4) {
                HStack(spacing: 10) {
                    askModeToggle

                    if isRecording {
                        listeningPill
                    } else {
                        pill
                    }

                    Group {
                        if isRecording {
                            stopButton
                        } else if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            sendButton
                        } else {
                            micButton
                        }
                    }
                    .glassEffectID("action", in: glassNamespace)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background {
                // Opaque black behind the bar (RN-style) so scrolled content doesn't
                // bleed through as a two-tone panel, with a fade-out strip above it.
                // The glass elements still float on top with their specular edges.
                VStack(spacing: 0) {
                    LinearGradient(
                        colors: [Theme.Colors.background.opacity(0), Theme.Colors.background],
                        startPoint: .top, endPoint: .bottom
                    )
                    .frame(height: 20)
                    Theme.Colors.background
                }
                .padding(.top, -20)
                .ignoresSafeArea(edges: .bottom)
                .allowsHitTesting(false)
            }
        }
    }

    private var askModeToggle: some View {
        Button {
            Haptics.lightTap()
            day.isAskMode.toggle()
            // Deliberately keep `text` — a draft typed in the wrong mode survives the
            // switch (improvement over RN, which wiped it).
            day.clearChat()
        } label: {
            Text("?")
                .font(Theme.Fonts.ui(20, weight: .semibold))
                .foregroundStyle(day.isAskMode ? .white : Theme.Colors.textTertiary)
                .frame(width: 48, height: 48)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .circle)
    }

    private var pill: some View {
        TextField(placeholder, text: $text, axis: .vertical)
            .font(Theme.Fonts.ui(17))
            .foregroundStyle(Theme.Colors.textPrimary)
            .tint(Theme.Colors.accent)
            .lineLimit(1...5)
            .focused($focused)
            .onSubmit(submit)
            .submitLabel(.send)
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .glassEffect(.regular, in: .rect(cornerRadius: Theme.Spacing.pillRadius))
            .overlay {
                // Ask mode: clear glass with an accent outline + glow (no tint fill).
                if day.isAskMode {
                    RoundedRectangle(cornerRadius: Theme.Spacing.pillRadius)
                        .stroke(Theme.Colors.accent, lineWidth: 1.5)
                }
            }
            .shadow(
                color: day.isAskMode ? Theme.Colors.accent.opacity(0.4) : .clear,
                radius: day.isAskMode ? 8 : 0
            )
    }

    private var placeholder: String {
        if day.isAskMode {
            return day.chat.isEmpty ? "Ask me anything.." : "Ask a follow-up.."
        }
        return "Log food"
    }

    /// Pill content while recording: just "Listening" + dots until the user stops
    /// (no live transcript — RN parity; the words land after stop → parse).
    private var listeningPill: some View {
        HStack(spacing: 8) {
            Text("Listening")
                .font(Theme.Fonts.ui(17, weight: .medium))
                .foregroundStyle(Theme.Colors.recording)
            PulsingDots(color: Theme.Colors.recording)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: Theme.Spacing.pillRadius))
    }

    private var stopButton: some View {
        Button {
            Haptics.impact()
            onMicTap()
        } label: {
            RoundedRectangle(cornerRadius: 4)
                .fill(.white)
                .frame(width: 14, height: 14)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.tint(Theme.Colors.recording).interactive(), in: .circle)
    }

    private var sendButton: some View {
        Button(action: submit) {
            Image(systemName: "arrow.up")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.Colors.accent)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .circle)
        .overlay(Circle().stroke(Theme.Colors.accent, lineWidth: 2))
    }

    private var micButton: some View {
        Button {
            guard voiceEnabled, !isPreparingVoice else { return }
            Haptics.impact()
            onMicTap()
        } label: {
            Group {
                if isPreparingVoice {
                    ProgressView().tint(.black)
                } else {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.black)
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.tint(Theme.Colors.accent).interactive(), in: .circle)
        .opacity(voiceEnabled ? 1 : 0.55)
    }

    private func submit() {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        focused = false
        text = ""
        Haptics.impact()
        if day.isAskMode {
            day.askRecommendation(trimmed)
        } else {
            day.submitFood(trimmed)
        }
    }
}
