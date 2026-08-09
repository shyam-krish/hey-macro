import Foundation
import Observation

/// Trends state: range selection, series toggles, chart data, and derived stats.
@Observable @MainActor
final class TrendsModel {
    enum DateRange: Int, CaseIterable {
        case week = 7
        case month = 30
        case quarter = 90

        var label: String {
            switch self {
            case .week: "7D"
            case .month: "30D"
            case .quarter: "90D"
            }
        }
    }

    var range: DateRange = .month
    private(set) var showCalories = true
    private(set) var showWeight = true
    private(set) var points: [TrendPoint] = []
    private(set) var averages = MealAverages()
    private(set) var isLoading = false

    private let store: DataStore

    init(store: DataStore) {
        self.store = store
    }

    func load() async {
        isLoading = points.isEmpty
        let end = LocalDate.today()
        let start = end.adding(days: -(range.rawValue - 1))
        // Silent-fail like RN — empty chart beats an error screen here.
        async let trend = try? store.getTrendData(userID: DataStore.defaultUserID, from: start, to: end)
        async let meals = try? store.getMealAverages(userID: DataStore.defaultUserID, from: start, to: end)
        points = await trend ?? []
        averages = await meals ?? MealAverages()
        isLoading = false
    }

    /// At least one series must stay on (RN guards the same way).
    func toggleCalories() {
        guard !(showCalories && !showWeight) else { return }
        showCalories.toggle()
    }

    func toggleWeight() {
        guard !(showWeight && !showCalories) else { return }
        showWeight.toggle()
    }

    // MARK: - Derived stats

    /// Mean of days that actually have calories logged (> 0).
    var averageCalories: Int? {
        let values = points.compactMap(\.calories).filter { $0 > 0 }
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / values.count
    }

    /// Last logged weight minus first logged weight in range.
    var weightChange: Double? {
        let weights = points.compactMap(\.weight)
        guard let first = weights.first, let last = weights.last, weights.count >= 2 else { return nil }
        return last - first
    }

    var calorieValues: [(date: LocalDate, value: Int)] {
        points.compactMap { point in
            point.calories.map { (point.date, $0) }
        }
    }

    var weightValues: [(date: LocalDate, value: Double)] {
        points.compactMap { point in
            point.weight.map { (point.date, $0) }
        }
    }
}

/// Nice axis ranges — port of the RN `niceRange` (≈4 ticks, minimum step 0.2).
enum AxisMath {
    struct NiceRange {
        var lowerBound: Double
        var upperBound: Double
        var step: Double

        var ticks: [Double] {
            guard step > 0 else { return [lowerBound] }
            return stride(from: lowerBound, through: upperBound + step / 2, by: step).map { $0 }
        }
    }

    static func niceRange(min rawMin: Double, max rawMax: Double, minStep: Double = 0.2) -> NiceRange {
        guard rawMax > rawMin else {
            let pad = Swift.max(minStep, Swift.max(abs(rawMin) * 0.1, 1))
            return NiceRange(lowerBound: rawMin - pad, upperBound: rawMax + pad, step: pad)
        }
        let rawStep = (rawMax - rawMin) / 4
        let magnitude = pow(10, floor(log10(rawStep)))
        let candidates = [1.0, 2.0, 2.5, 5.0, 10.0].map { $0 * magnitude }
        var step = candidates.first { $0 >= rawStep } ?? candidates.last!
        step = Swift.max(step, minStep)
        let lower = floor(rawMin / step) * step
        let upper = ceil(rawMax / step) * step
        return NiceRange(lowerBound: lower, upperBound: upper, step: step)
    }
}
