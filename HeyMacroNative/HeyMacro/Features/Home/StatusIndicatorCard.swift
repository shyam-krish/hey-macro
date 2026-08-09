import SwiftUI

/// Floating status card shown while recording / processing / saving / errored (never for chat).
/// Rotates the "Analyzing…" message every 5s starting at a random index, like the RN version.
struct StatusIndicatorCard: View {
    @Environment(DayModel.self) private var day

    static let analyzingMessages = [
        "Analyzing", "Calculating macros", "Looking up nutrition", "Crunching numbers", "Estimating portions",
    ]

    @State private var messageIndex = Int.random(in: 0..<analyzingMessages.count)

    var body: some View {
        switch day.phase {
        case .idle, .recording:
            // Recording state lives in the input pill itself (RN parity) — no floating card.
            EmptyView()
        case .saving:
            card(text: "Updating your macros", color: Theme.Colors.accent, showsDots: true)
        case .processing(let transcript):
            card(
                text: Self.analyzingMessages[messageIndex],
                color: Theme.Colors.accent,
                showsDots: true,
                subtitle: "\u{201C}\(transcript)\u{201D}",
                onCancel: { day.cancelProcessing() }
            )
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(5))
                    messageIndex = (messageIndex + 1) % Self.analyzingMessages.count
                }
            }
        case .error(let message):
            errorCard(message)
        }
    }

    private func card(
        text: String, color: Color, showsDots: Bool,
        subtitle: String? = nil, onCancel: (() -> Void)? = nil
    ) -> some View {
        // The ✕ is part of the card layout (not a floating overlay) so its hit target
        // always matches its rendered position.
        ZStack {
            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    Text(text)
                        .font(Theme.Fonts.ui(17, weight: .medium))
                        .foregroundStyle(Theme.Colors.textPrimary)
                    if showsDots {
                        PulsingDots(color: color)
                    }
                }
                if let subtitle {
                    Text(subtitle)
                        .font(Theme.Fonts.ui(14).italic())
                        .foregroundStyle(Color(hex: 0xAAAAAA))
                        .lineLimit(2)
                }
            }
            .padding(.horizontal, 36) // keep text clear of the ✕
            if let onCancel {
                HStack {
                    Spacer()
                    Button {
                        Haptics.lightTap()
                        onCancel()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Theme.Colors.textSecondary)
                            .frame(width: 40, height: 40)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(color, lineWidth: 1.5))
        .shadow(color: color.opacity(0.35), radius: 12)
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    private func errorCard(_ message: String) -> some View {
        HStack {
            Text(message)
                .font(Theme.Fonts.ui(14))
                .foregroundStyle(Theme.Colors.error)
                .frame(maxWidth: .infinity, alignment: .center)
                .multilineTextAlignment(.center)
            Button {
                day.dismissError()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Colors.error)
                    .padding(6)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .background(Theme.Colors.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.Colors.error, lineWidth: 1.5))
        .shadow(color: Theme.Colors.error.opacity(0.35), radius: 12)
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }
}

/// Three dots pulsing in sequence (0.3 → 1 opacity), the RN dot-loader look.
struct PulsingDots: View {
    var color: Color
    @State private var animating = false

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(color)
                    .frame(width: 5, height: 5)
                    .opacity(animating ? 1 : 0.3)
                    .animation(
                        .easeInOut(duration: 0.3)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.2),
                        value: animating
                    )
            }
        }
        .onAppear { animating = true }
    }
}
