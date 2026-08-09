import Foundation
import Testing
@testable import HeyMacro

/// Ports of the observable behaviors of `useMacroCalculator.ts`.
@MainActor
struct MacroCalculatorTests {
    private func makeCalculator() -> MacroCalculator {
        MacroCalculator(targets: MacroTargets(
            userID: "default-user", calories: 2690, protein: 170, carbs: 300, fat: 90,
            createdAt: "", updatedAt: ""
        ))
    }

    @Test func editingCaloriesClearsMacros() {
        let calc = makeCalculator()
        calc.setCalories("2000")
        #expect(calc.calories == "2000")
        #expect(calc.protein.isEmpty && calc.carbs.isEmpty && calc.fat.isEmpty)
        #expect(calc.calculatedField == nil)
        #expect(!calc.isValid, "only 1 field set")
    }

    @Test func exactlyThreeSetDerivesTheFourth() {
        let calc = makeCalculator()
        calc.setCalories("2000")
        calc.setProtein("150")
        calc.setCarbs("200")
        // fat = (2000 - 150*4 - 200*4) / 9 = (2000 - 600 - 800) / 9 = 600/9 ≈ 67
        #expect(calc.fat == "67")
        #expect(calc.calculatedField == .fat)
        #expect(calc.isValid)
    }

    @Test func macrosOnlyDeriveCalories() {
        let calc = makeCalculator()
        calc.setCalories("")
        calc.setProtein("150")
        calc.setCarbs("200")
        calc.setFat("70")
        // calories = 150*4 + 200*4 + 70*9 = 600 + 800 + 630 = 2030
        #expect(calc.calories == "2030")
        #expect(calc.calculatedField == .calories)
    }

    @Test func editingTheDerivedFieldTakesItOver() {
        let calc = makeCalculator()
        calc.setCalories("2000")
        calc.setProtein("150")
        calc.setCarbs("200")
        #expect(calc.calculatedField == .fat)

        calc.setFat("80")
        #expect(calc.calculatedField == nil, "user override un-flags auto")
        #expect(calc.fat == "80")
        #expect(calc.calories == "2000", "no recompute on override")
    }

    @Test func validationRules() {
        let calc = makeCalculator()
        #expect(calc.isValid, "initial targets valid")

        calc.setProtein("-10")
        #expect(!calc.isValid)
        #expect(calc.validationError == "Values cannot be negative")

        calc.setCalories("0")
        calc.setProtein("0")
        calc.setCarbs("0")
        // fat derives to 0 → all set, calories == 0
        #expect(calc.validationError == "Calories must be greater than 0")
        #expect(!calc.isValid)
    }
}

/// Ports of the `MealDetailSheet.tsx` smart-sync rules.
struct MacroSyncTests {
    private var entry: FoodEntry {
        FoodEntry(
            foodEntryID: "e1", userID: "default-user", dailyLogID: "d1",
            mealType: .lunch, name: "Chicken bowl", quantity: "100g",
            calories: 400, protein: 30, carbs: 40, fat: 12,
            createdAt: "", updatedAt: ""
        )
    }

    @Test func editingMacroRecomputesCalories() {
        let original = MacroSync.Original(entry: entry)
        var form = MacroSync.initialForm(for: entry, original: original)
        form.protein = "50"
        let synced = MacroSync.sync(form, changed: .protein, original: original)
        // 50*4 + 40*4 + 12*9 = 200 + 160 + 108 = 468
        #expect(synced.calories == "468")
    }

    @Test func editingCaloriesScalesMacrosFromOriginalRatios() {
        let original = MacroSync.Original(entry: entry)
        var form = MacroSync.initialForm(for: entry, original: original)
        // original macro-derived calories = 30*4+40*4+12*9 = 388
        form.calories = "776"
        let synced = MacroSync.sync(form, changed: .calories, original: original)
        #expect(synced.protein == "60")
        #expect(synced.carbs == "80")
        #expect(synced.fat == "24")
    }

    @Test func editingQuantityScalesEverything() {
        let original = MacroSync.Original(entry: entry)
        var form = MacroSync.initialForm(for: entry, original: original)
        #expect(form.quantity == "100", "quantity field holds just the number")
        form.quantity = "150"
        let synced = MacroSync.sync(form, changed: .quantity, original: original)
        #expect(synced.calories == "600")
        #expect(synced.protein == "45")
        #expect(synced.carbs == "60")
        #expect(synced.fat == "18")
    }

    @Test func quantityReconstructionPreservesSeparator() {
        let spaced = FoodEntry(
            foodEntryID: "e2", userID: "u", dailyLogID: "d",
            mealType: .breakfast, name: "Eggs", quantity: "3 large",
            calories: 234, protein: 18, carbs: 2, fat: 17,
            createdAt: "", updatedAt: ""
        )
        let original = MacroSync.Original(entry: spaced)
        var form = MacroSync.initialForm(for: spaced, original: original)
        form.quantity = "2"
        let updates = MacroSync.finalUpdates(form, original: original)
        #expect(updates?.quantity == "2 large", "separator survives (RN dropped it: '2large')")
    }

    @Test func invalidNumbersRejectSave() {
        let original = MacroSync.Original(entry: entry)
        var form = MacroSync.initialForm(for: entry, original: original)
        form.calories = "abc"
        #expect(MacroSync.finalUpdates(form, original: original) == nil)
    }
}
