import SwiftUI

/// Chat transcript card for ask mode — floats above the input bar, auto-scrolls to the
/// newest message, shows a typing bubble while the answer is in flight.
struct RecommendationChat: View {
    @Environment(DayModel.self) private var day
    @State private var contentHeight: CGFloat = 0

    private static let maxHeight: CGFloat = 300

    var body: some View {
        if !day.chat.isEmpty || day.isAnsweringChat {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 10) {
                            ForEach(day.chat) { message in
                                bubble(for: message)
                            }
                            if day.isAnsweringChat {
                                HStack {
                                    ProgressView()
                                        .tint(Theme.Colors.accent)
                                        .padding(12)
                                        .background(Theme.Colors.divider)
                                        .clipShape(RoundedRectangle(cornerRadius: 14))
                                    Spacer()
                                }
                                .id("typing")
                            }
                        }
                        .padding(14)
                        // Measure content so the card hugs short chats and caps at 300pt —
                        // a maxHeight+fixedSize combo here breaks overlay hit-testing.
                        .onGeometryChange(for: CGFloat.self) { proxy in
                            proxy.size.height
                        } action: { height in
                            contentHeight = height
                        }
                    }
                    .onChange(of: day.chat.count) {
                        withAnimation {
                            proxy.scrollTo(day.chat.last?.id ?? day.chat.first?.id, anchor: .bottom)
                        }
                    }
                }
            }
            .frame(height: min(max(contentHeight, 44), Self.maxHeight))
            .background(Theme.Colors.card)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.Colors.accent, lineWidth: 1.5))
            .shadow(color: Theme.Colors.accent.opacity(0.3), radius: 12)
            .overlay(alignment: .topTrailing) {
                Button {
                    Haptics.lightTap()
                    day.clearChat()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Theme.Spacing.screenPadding)
        }
    }

    @ViewBuilder
    private func bubble(for message: DayModel.ChatMessage) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            Text(message.text)
                .font(Theme.Fonts.ui(15))
                .foregroundStyle(message.role == .user ? .black : Theme.Colors.textPrimary)
                .padding(.vertical, 10)
                .padding(.horizontal, 14)
                .background(message.role == .user ? Theme.Colors.accent : Theme.Colors.divider)
                .clipShape(
                    .rect(
                        topLeadingRadius: 14,
                        bottomLeadingRadius: message.role == .user ? 14 : 4,
                        bottomTrailingRadius: message.role == .user ? 4 : 14,
                        topTrailingRadius: 14
                    )
                )
                .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
            if message.role == .assistant { Spacer(minLength: 40) }
        }
        .id(message.id)
    }
}

/// Error toast pinned near the top — used for recommendation errors, auto-dismisses after 4s.
struct ErrorToast: View {
    var message: String
    var onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text(message)
                .font(Theme.Fonts.ui(14))
                .foregroundStyle(Theme.Colors.error)
                .lineLimit(3)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Colors.error)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(Theme.Colors.card)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.Colors.error, lineWidth: 1))
        .shadow(color: Theme.Colors.error.opacity(0.3), radius: 10)
        .padding(.horizontal, Theme.Spacing.screenPadding)
        .transition(.move(edge: .top).combined(with: .opacity))
        .task {
            try? await Task.sleep(for: .seconds(4))
            onDismiss()
        }
    }
}
