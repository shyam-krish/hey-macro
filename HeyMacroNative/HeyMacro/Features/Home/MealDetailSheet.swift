import SwiftUI

/// Meal detail: tap an item to edit inline (with smart macro syncing — see `MacroSync`),
/// delete with confirmation, live totals footer.
struct MealDetailSheet: View {
    @Environment(DayModel.self) private var day
    var meal: MealType

    @State private var editingID: String?
    @State private var form = MacroSync.Form()
    @State private var original: MacroSync.Original?
    @State private var editError: String?
    @State private var isSaving = false
    @State private var confirmingDelete = false

    private var entries: [FoodEntry] {
        day.log?.entries(for: meal) ?? []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule()
                .fill(Theme.Colors.textFaint)
                .frame(width: 40, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
                .padding(.bottom, 16)

            HStack(alignment: .firstTextBaseline) {
                Text(meal.displayName)
                    .font(Theme.Fonts.ui(24, weight: .bold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                Text("Tap item to edit")
                    .font(Theme.Fonts.ui(13))
                    .foregroundStyle(Theme.Colors.textTertiary)
            }
            .padding(.horizontal, Theme.Spacing.sheetPadding)
            .padding(.bottom, 12)

            Divider().background(Theme.Colors.divider)

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(entries) { entry in
                        if editingID == entry.foodEntryID {
                            editRow(entry)
                        } else {
                            viewRow(entry)
                        }
                        Divider().background(Theme.Colors.divider)
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)

            totalsFooter
        }
        .background(Theme.Colors.card)
        // Single detent: the sheet never expands — swiping scrolls the food list while
        // the title and totals stay pinned (RN's fixed 75%-max overlay behavior).
        .presentationDetents([.medium])
        .presentationContentInteraction(.scrolls)
        .presentationDragIndicator(.hidden)
        .presentationBackground(Theme.Colors.card)
        .alert("Delete Entry?", isPresented: $confirmingDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                guard let editingID else { return }
                Task {
                    do {
                        try await day.deleteEntry(editingID)
                        Haptics.success()
                        stopEditing()
                    } catch {
                        editError = "Failed to delete"
                    }
                }
            }
        } message: {
            Text("This will remove the item from your log.")
        }
    }

    // MARK: - Rows

    private func viewRow(_ entry: FoodEntry) -> some View {
        Button {
            Haptics.lightTap()
            startEditing(entry)
        } label: {
            // RN foodItemRow: paddingVertical 20, name(18)+quantity(15) block,
            // 16pt gap, then the evenly-spread macro columns.
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.name)
                        .font(Theme.Fonts.ui(18, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(entry.quantity)
                        .font(Theme.Fonts.ui(15))
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
                macroColumns(
                    calories: entry.calories, protein: entry.protein,
                    carbs: entry.carbs, fat: entry.fat
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.sheetPadding)
            .padding(.vertical, 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func editRow(_ entry: FoodEntry) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Name group with the trash button top-right (RN deleteButton placement).
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    underlinedField(
                        "Food name",
                        text: binding(\.name, field: .name),
                        font: Theme.Fonts.ui(18, weight: .semibold),
                        color: Theme.Colors.textPrimary,
                        lineColor: Theme.Colors.textFaint
                    )
                    fieldLabel("NAME")
                }
                Button {
                    confirmingDelete = true
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.Colors.deleteRed)
                        .padding(4)
                }
                .buttonStyle(.plain)
            }

            // Quantity group: number underlined, unit suffix outside, label below.
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    underlinedField(
                        "0",
                        text: binding(\.quantity, field: .quantity),
                        font: Theme.Fonts.ui(15),
                        color: Theme.Colors.textSecondary,
                        lineColor: Theme.Colors.track,
                        keyboard: original?.quantityNumber != nil ? .decimalPad : .default
                    )
                    if let unit = original?.quantityUnit, !unit.isEmpty {
                        Text(unit)
                            .font(Theme.Fonts.ui(15))
                            .foregroundStyle(Theme.Colors.textSecondary)
                    }
                }
                fieldLabel("QUANTITY")
            }

            HStack(spacing: 12) {
                macroEditField("CAL", text: binding(\.calories, field: .calories), suffix: nil)
                macroEditField("PROTEIN", text: binding(\.protein, field: .protein), suffix: "g")
                macroEditField("CARBS", text: binding(\.carbs, field: .carbs), suffix: "g")
                macroEditField("FAT", text: binding(\.fat, field: .fat), suffix: "g")
            }

            if let editError {
                Text(editError)
                    .font(Theme.Fonts.ui(13))
                    .foregroundStyle(Theme.Colors.error)
            }

            HStack(spacing: 10) {
                Button {
                    stopEditing()
                } label: {
                    Text("Cancel")
                        .font(Theme.Fonts.ui(15, weight: .medium))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Theme.Colors.track)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)

                Button {
                    save(entry)
                } label: {
                    Text(isSaving ? "Saving..." : "Save")
                        .font(Theme.Fonts.ui(15, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .disabled(isSaving)
            }
        }
        .padding(.horizontal, Theme.Spacing.sheetPadding)
        .padding(.vertical, 16)
        .background(Theme.Colors.elevated.opacity(0.5))
    }

    // MARK: - Edit plumbing

    private func startEditing(_ entry: FoodEntry) {
        let snapshot = MacroSync.Original(entry: entry)
        original = snapshot
        form = MacroSync.initialForm(for: entry, original: snapshot)
        editingID = entry.foodEntryID
        editError = nil
    }

    private func stopEditing() {
        editingID = nil
        original = nil
        form = MacroSync.Form()
        editError = nil
        isSaving = false
    }

    /// Binding that routes every keystroke through the MacroSync rules.
    private func binding(
        _ keyPath: WritableKeyPath<MacroSync.Form, String>,
        field: MacroSync.Field
    ) -> Binding<String> {
        Binding(
            get: { form[keyPath: keyPath] },
            set: { newValue in
                guard let original else {
                    form[keyPath: keyPath] = newValue
                    return
                }
                var updated = form
                updated[keyPath: keyPath] = newValue
                form = MacroSync.sync(updated, changed: field, original: original)
            }
        )
    }

    private func save(_ entry: FoodEntry) {
        guard let original else { return }
        guard let updates = MacroSync.finalUpdates(form, original: original) else {
            editError = "Calories and macros must be valid numbers"
            return
        }
        isSaving = true
        editError = nil
        Task {
            do {
                try await day.updateEntry(entry.foodEntryID, updates: updates)
                Haptics.success()
                stopEditing()
            } catch {
                editError = "Failed to save changes"
                isSaving = false
            }
        }
    }

    // MARK: - Small pieces

    /// Text field with the RN inline-edit look: underline under the field only.
    private func underlinedField(
        _ placeholder: String,
        text: Binding<String>,
        font: Font,
        color: Color,
        lineColor: Color,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        TextField(placeholder, text: text)
            .font(font)
            .foregroundStyle(color)
            .tint(Theme.Colors.accent)
            .keyboardType(keyboard)
            .padding(.bottom, 4)
            .overlay(alignment: .bottom) {
                Rectangle().fill(lineColor).frame(height: 1)
            }
    }

    /// RN inlineInputLabel: 11pt semibold, #555, below the field.
    private func fieldLabel(_ label: String) -> some View {
        Text(label)
            .font(Theme.Fonts.ui(11, weight: .semibold))
            .foregroundStyle(Theme.Colors.textDisabled)
    }

    /// Macro edit cell: the underline sits under the NUMBER only (min width 30),
    /// with the "g" suffix outside the line at full value size — matching RN.
    private func macroEditField(_ label: String, text: Binding<String>, suffix: String?) -> some View {
        VStack(spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                TextField("0", text: text)
                    .font(Theme.Fonts.number(17))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .tint(Theme.Colors.accent)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .fixedSize()
                    .frame(minWidth: 30)
                    .padding(.bottom, 2)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(Theme.Colors.textFaint).frame(height: 1)
                    }
                if let suffix {
                    Text(suffix)
                        .font(Theme.Fonts.number(17))
                        .foregroundStyle(Theme.Colors.textPrimary)
                }
            }
            Text(label)
                .font(Theme.Fonts.ui(12))
                .foregroundStyle(Theme.Colors.textTertiary)
        }
        .frame(maxWidth: .infinity)
    }

    /// RN sheetFooter: "Total" label inline-left, macro columns spread to its right.
    private var totalsFooter: some View {
        HStack(alignment: .center, spacing: 24) {
            Text("Total")
                .font(Theme.Fonts.ui(18, weight: .semibold))
                .foregroundStyle(Theme.Colors.textSecondary)
            macroColumns(
                calories: entries.reduce(0) { $0 + $1.calories },
                protein: entries.reduce(0) { $0 + $1.protein },
                carbs: entries.reduce(0) { $0 + $1.carbs },
                fat: entries.reduce(0) { $0 + $1.fat },
                labelSize: 11
            )
        }
        .padding(.horizontal, Theme.Spacing.sheetPadding)
        .padding(.top, 20)
        .padding(.bottom, 28)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.Colors.divider).frame(height: 1)
        }
    }

    private func macroColumns(
        calories: Int, protein: Int, carbs: Int, fat: Int, labelSize: CGFloat = 12
    ) -> some View {
        HStack(spacing: 0) {
            macroColumn("\(calories)", "CAL", labelSize: labelSize)
            macroColumn("\(protein)g", "PROTEIN", labelSize: labelSize)
            macroColumn("\(carbs)g", "CARBS", labelSize: labelSize)
            macroColumn("\(fat)g", "FAT", labelSize: labelSize)
        }
    }

    private func macroColumn(_ value: String, _ label: String, labelSize: CGFloat = 12) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(Theme.Fonts.number(17))
                .foregroundStyle(Theme.Colors.textPrimary)
            Text(label)
                .font(Theme.Fonts.ui(labelSize))
                .foregroundStyle(Theme.Colors.textTertiary)
        }
        .frame(maxWidth: .infinity)
    }
}
