import SwiftUI

/// Custom top bar: calendar button | ‹ date › | person menu. Screens hide the system
/// navigation bar and draw this instead (matching the RN layout).
struct TopBar: View {
    @Environment(DayModel.self) private var day
    var onCalendarTap: () -> Void
    var navigate: (Route) -> Void

    var body: some View {
        HStack {
            iconButton("calendar", action: onCalendarTap)

            Spacer()

            HStack(spacing: 16) {
                Button {
                    Haptics.selection()
                    withAnimation { changeDay(by: -1) }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Text(dateLabel)
                    .font(Theme.Fonts.ui(14, weight: .medium))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .frame(minWidth: 80)

                Button {
                    Haptics.selection()
                    withAnimation { changeDay(by: 1) }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .opacity(day.isToday ? 0 : 1)
                .disabled(day.isToday)
            }

            Spacer()

            Menu {
                Button("Trends", systemImage: "chart.line.uptrend.xyaxis") { navigate(.trends) }
                Button("Profile", systemImage: "person") { navigate(.profile) }
            } label: {
                iconLabel("person")
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
        .padding(.vertical, 8)
        .background(Theme.Colors.background)
    }

    private var dateLabel: String {
        if day.isToday { return "Today" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: day.selectedDate.startOfDay())
    }

    private func changeDay(by offset: Int) {
        let target = day.selectedDate.adding(days: offset)
        guard target <= .today() else { return }
        Task { await day.changeDate(to: target) }
    }

    private func iconButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.lightTap()
            action()
        } label: {
            iconLabel(symbol)
        }
        .buttonStyle(.plain)
    }

    private func iconLabel(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 16))
            .foregroundStyle(.white)
            .frame(width: 36, height: 36)
            .contentShape(Circle())
            .glassEffect(.regular.interactive(), in: .circle)
    }
}
