import SwiftUI
import Charts

/// Trends: 7D/30D/90D range picker, calories + weight chart, summary stats, meal averages.
struct TrendsScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var app
    @State private var model: TrendsModel?

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(title: "Trends") { dismiss() }

            if let model {
                ScrollView {
                    VStack(spacing: 20) {
                        rangePicker(model)
                        seriesToggles(model)
                        TrendChart(model: model)
                        statCards(model)
                        MealAveragesSection(averages: model.averages)
                    }
                    .padding(Theme.Spacing.screenPadding)
                }
            } else {
                Spacer()
                ProgressView().tint(.white)
                Spacer()
            }
        }
        .background(Theme.Colors.background)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            guard model == nil, let store = app.store else { return }
            let m = TrendsModel(store: store)
            model = m
            await m.load()
        }
    }

    private func rangePicker(_ model: TrendsModel) -> some View {
        HStack(spacing: 4) {
            ForEach(TrendsModel.DateRange.allCases, id: \.rawValue) { range in
                Button {
                    Haptics.selection()
                    model.range = range
                    Task { await model.load() }
                } label: {
                    Text(range.label)
                        .font(Theme.Fonts.ui(14, weight: .semibold))
                        .foregroundStyle(model.range == range ? .white : Theme.Colors.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(model.range == range ? Theme.Colors.track : .clear)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Theme.Colors.card)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func seriesToggles(_ model: TrendsModel) -> some View {
        HStack(spacing: 10) {
            seriesToggle("Calories", color: Theme.Colors.accent, isOn: model.showCalories) {
                model.toggleCalories()
            }
            seriesToggle("Weight", color: Theme.Colors.weight, isOn: model.showWeight) {
                model.toggleWeight()
            }
            Spacer()
        }
    }

    private func seriesToggle(_ label: String, color: Color, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(label)
                    .font(Theme.Fonts.ui(13, weight: .medium))
                    .foregroundStyle(isOn ? .white : Theme.Colors.textSecondary)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 12)
            .background(Capsule().stroke(isOn ? color : Theme.Colors.track, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func statCards(_ model: TrendsModel) -> some View {
        HStack(spacing: 12) {
            if let avg = model.averageCalories {
                statCard(title: "Avg Calories", value: avg.formatted(), color: Theme.Colors.accent)
            }
            if let change = model.weightChange {
                statCard(
                    title: "Weight Change",
                    value: String(format: "%+.1f lbs", change),
                    color: Theme.Colors.weight
                )
            }
        }
    }

    private func statCard(title: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(Theme.Fonts.number(22))
                .foregroundStyle(color)
            Text(title)
                .font(Theme.Fonts.ui(12))
                .foregroundStyle(Theme.Colors.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Theme.Colors.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Spacing.cardRadius))
    }
}

/// Calories (left axis) + weight (right axis) line chart. Swift Charts has no true dual axis,
/// so weight is normalized into the calorie domain and the trailing axis relabels the
/// normalized positions with real weight values.
struct TrendChart: View {
    var model: TrendsModel

    private static let chartHeight: CGFloat = 220

    var body: some View {
        Group {
            if model.isLoading {
                ProgressView().tint(.white).frame(height: Self.chartHeight)
            } else if model.points.isEmpty {
                Text("No data for this range")
                    .font(Theme.Fonts.ui(14))
                    .foregroundStyle(Theme.Colors.textTertiary)
                    .frame(maxWidth: .infinity)
                    .frame(height: Self.chartHeight)
            } else {
                chart
                    .frame(height: Self.chartHeight)
            }
        }
        .padding(12)
        .background(Theme.Colors.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Spacing.cardRadius))
    }

    // MARK: - Scales

    private var calorieRange: AxisMath.NiceRange? {
        let values = model.calorieValues.map { Double($0.value) }
        guard model.showCalories, !values.isEmpty else { return nil }
        return AxisMath.niceRange(min: values.min()!, max: values.max()!, minStep: 50)
    }

    private var weightRange: AxisMath.NiceRange? {
        let values = model.weightValues.map(\.value)
        guard model.showWeight, !values.isEmpty else { return nil }
        return AxisMath.niceRange(min: values.min()!, max: values.max()!, minStep: 0.2)
    }

    /// Plot domain: calorie range when calories shown, else the raw weight range.
    private var plotRange: AxisMath.NiceRange? {
        calorieRange ?? weightRange
    }

    private func normalizeWeight(_ weight: Double) -> Double {
        guard let weightRange, let plotRange, calorieRange != nil else { return weight }
        let weightSpan = weightRange.upperBound - weightRange.lowerBound
        guard weightSpan > 0 else { return plotRange.lowerBound }
        let fraction = (weight - weightRange.lowerBound) / weightSpan
        return plotRange.lowerBound + fraction * (plotRange.upperBound - plotRange.lowerBound)
    }

    private var xLabelDates: Set<String> {
        let dates = model.points.map(\.date.value)
        guard dates.count > 5 else { return Set(dates) }
        let stride = max(1, (dates.count - 1) / 4)
        var picked = Set<String>()
        var index = 0
        while index < dates.count {
            picked.insert(dates[index])
            index += stride
        }
        picked.insert(dates.last!)
        return picked
    }

    // MARK: - Chart

    private var chart: some View {
        Chart {
            if model.showCalories {
                ForEach(model.calorieValues, id: \.date) { point in
                    LineMark(
                        x: .value("Date", point.date.value),
                        y: .value("Calories", point.value),
                        series: .value("Series", "Calories")
                    )
                    .foregroundStyle(Theme.Colors.accent)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineJoin: .round))
                    PointMark(
                        x: .value("Date", point.date.value),
                        y: .value("Calories", point.value)
                    )
                    .foregroundStyle(Theme.Colors.accent)
                    .symbolSize(28)
                }
            }
            if model.showWeight {
                ForEach(model.weightValues, id: \.date) { point in
                    LineMark(
                        x: .value("Date", point.date.value),
                        y: .value("Weight", normalizeWeight(point.value)),
                        series: .value("Series", "Weight")
                    )
                    .foregroundStyle(Theme.Colors.weight)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineJoin: .round))
                    PointMark(
                        x: .value("Date", point.date.value),
                        y: .value("Weight", normalizeWeight(point.value))
                    )
                    .foregroundStyle(Theme.Colors.weight)
                    .symbolSize(28)
                }
            }
        }
        .chartYScale(domain: (plotRange.map { $0.lowerBound...$0.upperBound }) ?? 0...1)
        .chartXAxis {
            AxisMarks(values: .automatic) { value in
                if let label = value.as(String.self), xLabelDates.contains(label) {
                    AxisValueLabel {
                        Text(Self.shortDate(label))
                            .font(Theme.Fonts.number(11))
                            .foregroundStyle(Theme.Colors.textTertiary)
                    }
                }
            }
        }
        .chartYAxis {
            if let calorieRange {
                AxisMarks(position: .leading, values: calorieRange.ticks) { value in
                    AxisGridLine().foregroundStyle(Theme.Colors.gridLine)
                    AxisValueLabel {
                        if let v = value.as(Double.self) {
                            Text("\(Int(v))")
                                .font(Theme.Fonts.number(11))
                                .foregroundStyle(Theme.Colors.textTertiary)
                        }
                    }
                }
            }
            if let weightRange {
                if calorieRange == nil {
                    AxisMarks(position: .leading, values: weightRange.ticks) { value in
                        AxisGridLine().foregroundStyle(Theme.Colors.gridLine)
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(Self.weightLabel(v))
                                    .font(Theme.Fonts.number(11))
                                    .foregroundStyle(Theme.Colors.weight)
                            }
                        }
                    }
                } else {
                    AxisMarks(position: .trailing, values: weightRange.ticks.map(normalizeWeight)) { value in
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(Self.weightLabel(denormalizeWeight(v)))
                                    .font(Theme.Fonts.number(11))
                                    .foregroundStyle(Theme.Colors.weight)
                            }
                        }
                    }
                }
            }
        }
    }

    private func denormalizeWeight(_ plotted: Double) -> Double {
        guard let weightRange, let plotRange, calorieRange != nil else { return plotted }
        let plotSpan = plotRange.upperBound - plotRange.lowerBound
        guard plotSpan > 0 else { return weightRange.lowerBound }
        let fraction = (plotted - plotRange.lowerBound) / plotSpan
        return weightRange.lowerBound + fraction * (weightRange.upperBound - weightRange.lowerBound)
    }

    private static func weightLabel(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", value)
            : String(format: "%.1f", value)
    }

    /// `"2026-07-05"` → `"7/5"`
    private static func shortDate(_ value: String) -> String {
        guard let date = LocalDate(validating: value) else { return value }
        return "\(date.month)/\(date.day)"
    }
}

/// Per-meal averages with proportional bars, plus a total row.
struct MealAveragesSection: View {
    var averages: MealAverages

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("Meal Averages")
                    .font(Theme.Fonts.ui(16, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                if averages.loggedDays > 0 {
                    Text("over \(averages.loggedDays) logged day\(averages.loggedDays == 1 ? "" : "s")")
                        .font(Theme.Fonts.ui(12))
                        .foregroundStyle(Theme.Colors.textTertiary)
                }
            }

            if averages.loggedDays == 0 {
                Text("No meals logged for this range")
                    .font(Theme.Fonts.ui(14))
                    .foregroundStyle(Theme.Colors.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
            } else {
                let rows: [(String, MealAverage)] = [
                    ("Breakfast", averages.breakfast), ("Lunch", averages.lunch),
                    ("Dinner", averages.dinner), ("Snacks", averages.snacks),
                ]
                let maxCalories = max(rows.map(\.1.calories).max() ?? 1, 1)

                ForEach(rows, id: \.0) { label, avg in
                    mealRow(label: label, average: avg, fraction: Double(avg.calories) / Double(maxCalories))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Divider().background(Theme.Colors.divider)
                    mealRow(label: "Total", average: averages.total, fraction: nil)
                }
            }
        }
        .padding(16)
        .background(Theme.Colors.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Spacing.cardRadius))
    }

    private func mealRow(label: String, average: MealAverage, fraction: Double?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(Theme.Fonts.ui(14))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                Text("\(average.calories) cal")
                    .font(Theme.Fonts.number(15))
                    .foregroundStyle(Theme.Colors.accent)
            }
            if let fraction {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.Colors.divider)
                        Capsule().fill(Theme.Colors.accent)
                            .frame(width: geo.size.width * fraction)
                    }
                }
                .frame(height: 4)
            }
            Text("\(average.protein)g P · \(average.carbs)g C · \(average.fat)g F")
                .font(Theme.Fonts.number(12))
                .foregroundStyle(Theme.Colors.textSecondary)
        }
        .padding(.vertical, 4)
    }
}

/// Shared pushed-screen header: back chevron + centered title (screens hide the system bar).
struct ScreenHeader: View {
    var title: String
    var onBack: () -> Void

    var body: some View {
        ZStack {
            Text(title)
                .font(Theme.Fonts.ui(18, weight: .semibold))
                .foregroundStyle(Theme.Colors.textPrimary)
            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Spacer()
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.Colors.divider).frame(height: 0.5)
        }
    }
}
