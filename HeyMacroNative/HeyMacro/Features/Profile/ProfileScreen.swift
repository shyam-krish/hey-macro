import SwiftUI

/// Profile: edit name and macro targets. The targets editor uses `MacroCalculator` —
/// set any three of calories/protein/carbs/fat and the fourth derives via 4/4/9,
/// flagged with a green "auto" badge (calories is the anchor: editing it clears the macros).
struct ProfileScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var app
    @Environment(DayModel.self) private var day

    @State private var isEditingUser = false
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var isSavingUser = false

    @State private var isEditingTargets = false
    @State private var calculator: MacroCalculator?
    @State private var isSavingTargets = false
    @State private var saveError: String?

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(title: "Profile") { dismiss() }

            ScrollView {
                VStack(spacing: 28) {
                    userSection
                    targetsSection
                }
                .padding(Theme.Spacing.sheetPadding)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Theme.Colors.background)
        .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: - User section

    private var userSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("USER", isEditing: isEditingUser) {
                if let user = app.user {
                    firstName = user.firstName
                    lastName = user.lastName
                }
                isEditingUser = true
            }

            if isEditingUser {
                VStack(spacing: 0) {
                    labeledField("First Name", text: $firstName)
                    Divider().background(Theme.Colors.divider)
                    labeledField("Last Name", text: $lastName)
                }
                editButtons(
                    saving: isSavingUser,
                    saveDisabled: firstName.trimmingCharacters(in: .whitespaces).isEmpty
                        || lastName.trimmingCharacters(in: .whitespaces).isEmpty,
                    onCancel: { isEditingUser = false },
                    onSave: saveUser
                )
            } else {
                infoRow("Name", value: app.user.map { "\($0.firstName) \($0.lastName)" } ?? "Loading...")
            }
        }
    }

    private func saveUser() {
        isSavingUser = true
        Task {
            do {
                try await app.updateUser(
                    firstName: firstName.trimmingCharacters(in: .whitespaces),
                    lastName: lastName.trimmingCharacters(in: .whitespaces)
                )
                Haptics.success()
                isEditingUser = false
            } catch {
                saveError = error.localizedDescription
            }
            isSavingUser = false
        }
    }

    // MARK: - Targets section

    private var targetsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("MACRO TARGETS", isEditing: isEditingTargets) {
                if let targets = app.targets {
                    calculator = MacroCalculator(targets: targets)
                }
                isEditingTargets = true
            }

            if isEditingTargets, let calculator {
                Text("Set any 3 values and the 4th will auto-calculate")
                    .font(Theme.Fonts.ui(13))
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.Colors.card)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                VStack(spacing: 10) {
                    targetField("Calories", unit: nil, field: .calories, calculator: calculator)
                    targetField("Protein", unit: "g", field: .protein, calculator: calculator)
                    targetField("Carbs", unit: "g", field: .carbs, calculator: calculator)
                    targetField("Fat", unit: "g", field: .fat, calculator: calculator)
                }

                if let error = calculator.validationError ?? saveError {
                    Text(error)
                        .font(Theme.Fonts.ui(13))
                        .foregroundStyle(Theme.Colors.error)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(hex: 0x2A1A1A))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                formulaReference

                editButtons(
                    saving: isSavingTargets,
                    saveDisabled: !calculator.isValid,
                    onCancel: { isEditingTargets = false; saveError = nil },
                    onSave: saveTargets
                )
            } else if let targets = app.targets {
                VStack(spacing: 0) {
                    infoRow("Calories", value: "\(targets.calories)")
                    Divider().background(Theme.Colors.divider)
                    infoRow("Protein", value: "\(targets.protein) g")
                    Divider().background(Theme.Colors.divider)
                    infoRow("Carbs", value: "\(targets.carbs) g")
                    Divider().background(Theme.Colors.divider)
                    infoRow("Fat", value: "\(targets.fat) g")
                }
            }
        }
    }

    private func saveTargets() {
        guard let values = calculator?.finalValues() else { return }
        isSavingTargets = true
        saveError = nil
        Task {
            do {
                try await app.updateTargets(
                    calories: values.calories, protein: values.protein,
                    carbs: values.carbs, fat: values.fat
                )
                // Refresh the day so today's snapshot rewrite shows immediately.
                await day.refresh()
                Haptics.success()
                isEditingTargets = false
            } catch {
                saveError = error.localizedDescription
            }
            isSavingTargets = false
        }
    }

    private func targetField(
        _ label: String, unit: String?, field: MacroCalculator.Field, calculator: MacroCalculator
    ) -> some View {
        let isCalculated = calculator.calculatedField == field
        let binding = Binding<String>(
            get: {
                switch field {
                case .calories: calculator.calories
                case .protein: calculator.protein
                case .carbs: calculator.carbs
                case .fat: calculator.fat
                }
            },
            set: { newValue in
                switch field {
                case .calories: calculator.setCalories(newValue)
                case .protein: calculator.setProtein(newValue)
                case .carbs: calculator.setCarbs(newValue)
                case .fat: calculator.setFat(newValue)
                }
            }
        )

        return HStack {
            Text(label)
                .font(Theme.Fonts.ui(15))
                .foregroundStyle(Theme.Colors.textSecondary)
            if isCalculated {
                Text("auto")
                    .font(Theme.Fonts.ui(10, weight: .semibold))
                    .foregroundStyle(Theme.Colors.badgeGreenText)
                    .padding(.vertical, 2)
                    .padding(.horizontal, 6)
                    .background(Theme.Colors.ringGreen)
                    .clipShape(Capsule())
            }
            Spacer()
            TextField("", text: binding)
                .font(Theme.Fonts.number(16))
                .foregroundStyle(Theme.Colors.textPrimary)
                .tint(Theme.Colors.accent)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(minWidth: 100)
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(isCalculated ? Theme.Colors.calculatedFieldBackground : Theme.Colors.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isCalculated ? Theme.Colors.ringGreen : Theme.Colors.track, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .fixedSize(horizontal: true, vertical: false)
            if let unit {
                Text(unit)
                    .font(Theme.Fonts.ui(14))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
        }
    }

    private var formulaReference: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("1g Protein = 4 calories")
            Text("1g Carbs = 4 calories")
            Text("1g Fat = 9 calories")
        }
        .font(Theme.Fonts.ui(12))
        .foregroundStyle(Theme.Colors.textTertiary)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Colors.card)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Shared pieces

    private func sectionHeader(_ title: String, isEditing: Bool, onEdit: @escaping () -> Void) -> some View {
        HStack {
            Text(title)
                .font(Theme.Fonts.ui(12, weight: .semibold))
                .foregroundStyle(Theme.Colors.textTertiary)
                .kerning(1)
            Spacer()
            if !isEditing {
                Button {
                    Haptics.lightTap()
                    onEdit()
                } label: {
                    Text("Edit")
                        .font(Theme.Fonts.ui(13, weight: .semibold))
                        .foregroundStyle(.black)
                        .padding(.vertical, 5)
                        .padding(.horizontal, 14)
                        .background(.white)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(Theme.Fonts.ui(15))
                .foregroundStyle(Theme.Colors.textSecondary)
            Spacer()
            Text(value)
                .font(Theme.Fonts.number(16))
                .foregroundStyle(Theme.Colors.textPrimary)
        }
        .padding(.vertical, 12)
    }

    private func labeledField(_ label: String, text: Binding<String>) -> some View {
        HStack {
            Text(label)
                .font(Theme.Fonts.ui(15))
                .foregroundStyle(Theme.Colors.textSecondary)
            Spacer()
            TextField("", text: text)
                .font(Theme.Fonts.ui(16))
                .foregroundStyle(Theme.Colors.textPrimary)
                .tint(Theme.Colors.accent)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 12)
    }

    private func editButtons(
        saving: Bool, saveDisabled: Bool,
        onCancel: @escaping () -> Void, onSave: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 10) {
            Button(action: onCancel) {
                Text("Cancel")
                    .font(Theme.Fonts.ui(15, weight: .medium))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Theme.Colors.divider)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)

            Button(action: onSave) {
                Text(saving ? "Saving..." : "Save")
                    .font(Theme.Fonts.ui(15, weight: .semibold))
                    .foregroundStyle(saveDisabled ? Theme.Colors.textTertiary : .black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(saveDisabled ? Theme.Colors.track : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .disabled(saveDisabled || saving)
        }
        .padding(.top, 4)
    }
}
