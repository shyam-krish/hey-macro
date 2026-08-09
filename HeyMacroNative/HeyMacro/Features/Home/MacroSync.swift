import Foundation

/// Smart field syncing for the meal-edit form — ported from `MealDetailSheet.tsx`:
/// - editing a **macro** recomputes calories via 4/4/9
/// - editing **calories** rescales P/C/F proportionally from the ORIGINAL macro ratios
///   (so clearing and retyping calories never compounds rounding)
/// - editing **quantity** rescales all four macros by `newQty / originalQty`
///
/// One deliberate fix vs RN: the original reconstructed quantities without the separator
/// ("3 large" → "3large" after any edit). We capture and preserve the separator.
enum MacroSync {
    enum Field {
        case name, quantity, calories, protein, carbs, fat
    }

    struct Form: Equatable {
        var name = ""
        var quantity = ""
        var calories = ""
        var protein = ""
        var carbs = ""
        var fat = ""
    }

    /// Snapshot taken when editing starts; all scaling anchors to these values.
    struct Original {
        var calories: Int
        var protein: Int
        var carbs: Int
        var fat: Int
        var quantityNumber: Double?
        var quantitySeparator: String
        var quantityUnit: String

        init(entry: FoodEntry) {
            calories = entry.calories
            protein = entry.protein
            carbs = entry.carbs
            fat = entry.fat
            let parsed = MacroSync.parseQuantity(entry.quantity)
            quantityNumber = parsed.number
            quantitySeparator = parsed.separator
            quantityUnit = parsed.unit
        }
    }

    /// `"1.5 cups"` → (1.5, " ", "cups"); `"100g"` → (100, "", "g"); `"a bowl"` → (nil, "", "a bowl").
    static func parseQuantity(_ quantity: String) -> (number: Double?, separator: String, unit: String) {
        let trimmed = quantity.trimmingCharacters(in: .whitespaces)
        guard let match = trimmed.wholeMatch(of: /(\d+(?:\.\d+)?)(\s*)(.*)/) else {
            return (nil, "", trimmed)
        }
        return (Double(match.1), String(match.2), String(match.3))
    }

    static func formatQuantityNumber(_ number: Double) -> String {
        number.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(number))
            : String(number)
    }

    static func caloriesFromMacros(protein: Int, carbs: Int, fat: Int) -> Int {
        protein * 4 + carbs * 4 + fat * 9
    }

    /// Initial form when editing starts (quantity field holds just the number when parseable).
    static func initialForm(for entry: FoodEntry, original: Original) -> Form {
        Form(
            name: entry.name,
            quantity: original.quantityNumber.map(formatQuantityNumber) ?? entry.quantity,
            calories: String(entry.calories),
            protein: String(entry.protein),
            carbs: String(entry.carbs),
            fat: String(entry.fat)
        )
    }

    /// Applies the sync rules after `field` changed. Mirrors `handleEditFormChange`.
    static func sync(_ form: Form, changed field: Field, original: Original) -> Form {
        var form = form

        switch field {
        case .quantity:
            guard
                let originalQty = original.quantityNumber, originalQty > 0,
                let newQty = Double(form.quantity), newQty > 0
            else { return form }
            let ratio = newQty / originalQty
            form.calories = String(Int((Double(original.calories) * ratio).rounded()))
            form.protein = String(Int((Double(original.protein) * ratio).rounded()))
            form.carbs = String(Int((Double(original.carbs) * ratio).rounded()))
            form.fat = String(Int((Double(original.fat) * ratio).rounded()))

        case .calories:
            let originalCaloriesFromMacros = caloriesFromMacros(
                protein: original.protein, carbs: original.carbs, fat: original.fat
            )
            let newCalories = Int(form.calories) ?? 0
            guard originalCaloriesFromMacros > 0, newCalories > 0 else { return form }
            let ratio = Double(newCalories) / Double(originalCaloriesFromMacros)
            form.protein = String(Int((Double(original.protein) * ratio).rounded()))
            form.carbs = String(Int((Double(original.carbs) * ratio).rounded()))
            form.fat = String(Int((Double(original.fat) * ratio).rounded()))

        case .protein, .carbs, .fat:
            form.calories = String(caloriesFromMacros(
                protein: Int(form.protein) ?? 0,
                carbs: Int(form.carbs) ?? 0,
                fat: Int(form.fat) ?? 0
            ))

        case .name:
            break
        }

        return form
    }

    /// Validated values ready for `updateFoodEntry`, or nil (→ "must be valid numbers" error).
    static func finalUpdates(_ form: Form, original: Original) -> DataStore.FoodEntryUpdates? {
        guard
            let calories = Int(form.calories),
            let protein = Int(form.protein),
            let carbs = Int(form.carbs),
            let fat = Int(form.fat)
        else { return nil }

        // Reconstruct "number + unit" preserving the original separator.
        var finalQuantity = form.quantity
        if original.quantityNumber != nil, !original.quantityUnit.isEmpty,
           let number = Double(form.quantity) {
            finalQuantity = formatQuantityNumber(number) + original.quantitySeparator + original.quantityUnit
        }

        return DataStore.FoodEntryUpdates(
            name: form.name,
            quantity: finalQuantity,
            calories: calories,
            protein: protein,
            carbs: carbs,
            fat: fat
        )
    }
}
