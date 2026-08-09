import Foundation
import Observation

/// Targets editor logic — a 1:1 port of `useMacroCalculator.ts`.
///
/// Behavior contract (ported exactly):
/// - Fields are strings; empty means unset.
/// - Editing **calories** clears the other three (calories anchors the flow).
/// - Editing a macro that was auto-calculated just un-flags it (user takes it over manually).
/// - Otherwise, when exactly 3 fields are set, the 4th is derived via 4/4/9 and flagged
///   as `calculatedField` (shown with the green "auto" badge).
@Observable @MainActor
final class MacroCalculator {
    enum Field: String {
        case calories, protein, carbs, fat
    }

    static let proteinCalsPerGram = 4.0
    static let carbsCalsPerGram = 4.0
    static let fatCalsPerGram = 9.0

    private(set) var calories: String
    private(set) var protein: String
    private(set) var carbs: String
    private(set) var fat: String
    private(set) var calculatedField: Field?

    init(targets: MacroTargets) {
        calories = String(targets.calories)
        protein = String(targets.protein)
        carbs = String(targets.carbs)
        fat = String(targets.fat)
    }

    func reset(to targets: MacroTargets) {
        calories = String(targets.calories)
        protein = String(targets.protein)
        carbs = String(targets.carbs)
        fat = String(targets.fat)
        calculatedField = nil
    }

    // MARK: - Field setters

    func setCalories(_ value: String) {
        calories = value
        protein = ""
        carbs = ""
        fat = ""
        calculatedField = nil
    }

    func setProtein(_ value: String) { setMacro(.protein, value) }
    func setCarbs(_ value: String) { setMacro(.carbs, value) }
    func setFat(_ value: String) { setMacro(.fat, value) }

    private func setMacro(_ field: Field, _ value: String) {
        write(field, value)
        if calculatedField == field {
            calculatedField = nil
            return
        }
        deriveMissingField()
    }

    private func write(_ field: Field, _ value: String) {
        switch field {
        case .calories: calories = value
        case .protein: protein = value
        case .carbs: carbs = value
        case .fat: fat = value
        }
    }

    private func deriveMissingField() {
        let fields: [(Field, String)] = [
            (.calories, calories), (.protein, protein), (.carbs, carbs), (.fat, fat),
        ]
        let setCount = fields.count { !$0.1.isEmpty }
        guard setCount == 3, let missing = fields.first(where: { $0.1.isEmpty })?.0 else {
            calculatedField = nil
            return
        }

        let cal = Self.parse(calories) ?? 0
        let p = Self.parse(protein) ?? 0
        let c = Self.parse(carbs) ?? 0
        let f = Self.parse(fat) ?? 0

        let derived: Double = switch missing {
        case .calories: p * Self.proteinCalsPerGram + c * Self.carbsCalsPerGram + f * Self.fatCalsPerGram
        case .protein: (cal - c * Self.carbsCalsPerGram - f * Self.fatCalsPerGram) / Self.proteinCalsPerGram
        case .carbs: (cal - p * Self.proteinCalsPerGram - f * Self.fatCalsPerGram) / Self.carbsCalsPerGram
        case .fat: (cal - p * Self.proteinCalsPerGram - c * Self.carbsCalsPerGram) / Self.fatCalsPerGram
        }

        write(missing, String(Int(derived.rounded())))
        calculatedField = missing
    }

    // MARK: - Validation (ported: silent until all filled, then negatives / zero calories)

    var validationError: String? {
        guard allParsed != nil else { return nil }
        return explicitError
    }

    var isValid: Bool {
        guard let values = allParsed else { return false }
        return values.calories > 0 && values.protein >= 0 && values.carbs >= 0 && values.fat >= 0
    }

    private var explicitError: String? {
        guard let values = allParsed else { return nil }
        if values.calories < 0 || values.protein < 0 || values.carbs < 0 || values.fat < 0 {
            return "Values cannot be negative"
        }
        if values.calories == 0 {
            return "Calories must be greater than 0"
        }
        return nil
    }

    private var allParsed: (calories: Double, protein: Double, carbs: Double, fat: Double)? {
        guard
            let cal = Self.parse(calories),
            let p = Self.parse(protein),
            let c = Self.parse(carbs),
            let f = Self.parse(fat)
        else { return nil }
        return (cal, p, c, f)
    }

    func finalValues() -> (calories: Int, protein: Int, carbs: Int, fat: Int)? {
        guard let values = allParsed else { return nil }
        return (
            Int(values.calories.rounded()),
            Int(values.protein.rounded()),
            Int(values.carbs.rounded()),
            Int(values.fat.rounded())
        )
    }

    private static func parse(_ value: String) -> Double? {
        value.isEmpty ? nil : Double(value)
    }
}
