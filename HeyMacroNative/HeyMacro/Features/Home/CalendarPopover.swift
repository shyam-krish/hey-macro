import SwiftUI

/// Month calendar with mini calorie rings and weight labels per day.
/// Backwards navigation is bounded by the earliest logged date; future days are disabled.
struct CalendarPopover: View {
    @Environment(DayModel.self) private var day
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var displayedYear: Int
    @State private var displayedMonth: Int
    @State private var calorieData: [String: DayCalorieDatum] = [:]
    @State private var weightData: [String: Double] = [:]
    @State private var earliestDate: LocalDate?

    private let weekdaySymbols = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

    init(anchor: LocalDate) {
        _displayedYear = State(initialValue: anchor.year)
        _displayedMonth = State(initialValue: anchor.month)
    }

    var body: some View {
        VStack(spacing: 12) {
            header
            weekdayRow
            dayGrid
        }
        .padding(16)
        // Popovers size to intrinsic content — pin a near-full-screen width like the RN
        // overlay card (screen − 32) so the 7-column ring grid has room.
        .frame(width: 370)
        .background(Theme.Colors.background)
        .task(id: "\(displayedYear)-\(displayedMonth)") { await loadMonth() }
    }

    private var header: some View {
        HStack {
            Button { changeMonth(by: -1) } label: {
                Image(systemName: "chevron.left")
                    .foregroundStyle(canGoBack ? Theme.Colors.textTertiary : Theme.Colors.gridLine)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(!canGoBack)
            .accessibilityLabel("Previous month")

            Spacer()

            Text(monthTitle)
                .font(Theme.Fonts.ui(16, weight: .semibold))
                .foregroundStyle(Theme.Colors.textPrimary)

            Spacer()

            Button { changeMonth(by: 1) } label: {
                Image(systemName: "chevron.right")
                    .foregroundStyle(canGoForward ? Theme.Colors.textTertiary : Theme.Colors.gridLine)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(!canGoForward)
            .accessibilityLabel("Next month")
        }
    }

    private var weekdayRow: some View {
        HStack(spacing: 0) {
            ForEach(weekdaySymbols, id: \.self) { symbol in
                Text(symbol)
                    .font(Theme.Fonts.ui(10))
                    .foregroundStyle(Theme.Colors.textFaint)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var dayGrid: some View {
        let today = LocalDate.today()
        let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(0..<leadingBlanks, id: \.self) { index in
                Color.clear.frame(height: 52).id("blank-\(index)")
            }
            ForEach(1...daysInMonth, id: \.self) { dayNumber in
                let date = LocalDate(year: displayedYear, month: displayedMonth, day: dayNumber)
                dayCell(date: date, dayNumber: dayNumber, today: today)
            }
        }
    }

    @ViewBuilder
    private func dayCell(date: LocalDate, dayNumber: Int, today: LocalDate) -> some View {
        let isFuture = date > today
        let isSelected = date == day.selectedDate
        let isToday = date == today
        let datum = calorieData[date.value]

        Button {
            guard !isFuture else { return }
            Haptics.selection()
            Task { await day.changeDate(to: date) }
            dismiss()
        } label: {
            VStack(spacing: 2) {
                ZStack {
                    if let datum, datum.calories > 0 {
                        Circle()
                            .stroke(Theme.Colors.gridLine, lineWidth: 2)
                        Circle()
                            .trim(from: 0, to: min(Double(datum.calories) / Double(max(datum.calorieTarget, 1)), 1))
                            .stroke(
                                CalorieRing.calendarRingColor(
                                    current: datum.calories, target: datum.calorieTarget, isToday: isToday
                                ),
                                style: StrokeStyle(lineWidth: 2, lineCap: .round)
                            )
                            .rotationEffect(.degrees(-90))
                    }
                    Text("\(dayNumber)")
                        .font(Theme.Fonts.number(12))
                        .foregroundStyle(
                            isFuture ? Theme.Colors.track
                                : isToday ? Theme.Colors.accent
                                : Theme.Colors.textPrimary
                        )
                }
                .frame(width: 32, height: 32)

                Text(weightData[date.value].map { WeightCard.format($0) } ?? " ")
                    .font(Theme.Fonts.number(9))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background {
                if isSelected {
                    RoundedRectangle(cornerRadius: 16).fill(Theme.Colors.track)
                } else if isToday {
                    RoundedRectangle(cornerRadius: 16).stroke(Theme.Colors.accent, lineWidth: 1.5)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(isFuture)
        .accessibilityLabel(
            date.startOfDay().formatted(.dateTime.weekday(.wide).month(.wide).day().year())
        )
        .accessibilityValue(dayAccessibilityValue(date: date, datum: datum))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: - Month math & data

    private var monthTitle: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: LocalDate(year: displayedYear, month: displayedMonth, day: 1).startOfDay())
    }

    private var daysInMonth: Int {
        LocalDate.monthRange(year: displayedYear, month: displayedMonth).end.day
    }

    /// Weekday offset of the 1st (0 = Sunday).
    private var leadingBlanks: Int {
        let first = LocalDate(year: displayedYear, month: displayedMonth, day: 1).startOfDay()
        return Calendar.current.component(.weekday, from: first) - 1
    }

    private var canGoBack: Bool {
        guard let earliestDate else { return false }
        let firstOfDisplayed = LocalDate(year: displayedYear, month: displayedMonth, day: 1)
        return earliestDate < firstOfDisplayed
    }

    private var canGoForward: Bool {
        let today = LocalDate.today()
        return displayedYear < today.year || (displayedYear == today.year && displayedMonth < today.month)
    }

    private func changeMonth(by offset: Int) {
        Haptics.selection()
        var month = displayedMonth + offset
        var year = displayedYear
        if month < 1 { month = 12; year -= 1 }
        if month > 12 { month = 1; year += 1 }
        displayedMonth = month
        displayedYear = year
    }

    private func loadMonth() async {
        guard let store = app.store else { return }
        // Silent-fail like RN: the calendar still renders without ring data.
        earliestDate = try? await store.getEarliestLogDate(userID: DataStore.defaultUserID)
        let calories = (try? await store.getMonthCalorieData(
            userID: DataStore.defaultUserID, year: displayedYear, month: displayedMonth
        )) ?? []
        calorieData = Dictionary(uniqueKeysWithValues: calories.map { ($0.date.value, $0) })
        let weights = (try? await store.getMonthWeightData(
            userID: DataStore.defaultUserID, year: displayedYear, month: displayedMonth
        )) ?? []
        weightData = Dictionary(uniqueKeysWithValues: weights.map { ($0.date.value, $0.weight) })
    }

    private func dayAccessibilityValue(date: LocalDate, datum: DayCalorieDatum?) -> String {
        var details: [String] = []
        if let datum, datum.calories > 0 {
            details.append(
                "\(datum.calories.formatted()) of \(datum.calorieTarget.formatted()) calories"
            )
        }
        if let weight = weightData[date.value] {
            details.append("\(WeightCard.format(weight)) pounds")
        }
        return details.isEmpty ? "No food or weight logged" : details.joined(separator: ", ")
    }
}
