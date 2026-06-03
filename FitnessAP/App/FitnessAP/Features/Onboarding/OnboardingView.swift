// OnboardingView.swift
// Three-step profile setup shown the first time a user logs in.
// Saves to PUT /profiles/:userId then dismisses, triggering a plan reload.

import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState

    // Navigation
    @State private var step = 0
    private let totalSteps = 3

    // Step 1 — About You
    // unitSystem drives all height/weight display in this step.
    @State private var unitSystem: UnitSystem = .metric
    @State private var age: Int = 35
    @State private var sex: String = "male"
    // Height: ground truth always in cm; ft/in state synced when unit changes.
    @State private var heightCm: Double = 170
    @State private var heightFt: Int = 5
    @State private var heightIn: Int = 7
    // Weight: ground truth always in kg; display value synced when unit changes.
    @State private var weightDisplay: Double = 90   // in currently selected units

    // Step 2 — Training
    @State private var trainingLevel: String = "beginner"
    @State private var daysPerWeek: Int = 3
    @State private var equipment: Set<String> = ["bodyweight", "dumbbells"]

    // Step 3 — GLP-1
    @State private var glpDrug: String = "Semaglutide"
    @State private var glpDoseMgText: String = ""
    @State private var injectionDay: Int = 1
    @State private var glpStartDate: Date = Date()

    // Save state
    @State private var isSaving = false
    @State private var saveError: String?

    private let equipmentOptions = [
        ("bodyweight",  "Bodyweight"),
        ("dumbbells",   "Dumbbells"),
        ("barbell",     "Barbell"),
        ("cables",      "Cable machine"),
        ("machines",    "Resistance machines"),
        ("kettlebells", "Kettlebells"),
    ]

    private let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    // MARK: - Computed weight in kg (for storage)
    private var weightKg: Double { unitSystem.storeWeight(weightDisplay) }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {

                // ── Progress bar ──────────────────────────────────────────
                ProgressView(value: Double(step + 1), total: Double(totalSteps))
                    .padding(.horizontal)
                    .padding(.top, 8)

                Text("Step \(step + 1) of \(totalSteps)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.top, 4)

                // ── Step content ──────────────────────────────────────────
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        switch step {
                        case 0:  step1
                        case 1:  step2
                        default: step3
                        }
                    }
                    .padding()
                }

                Divider()

                if let err = saveError {
                    Text(err)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal)
                        .padding(.top, 8)
                }

                // ── Nav buttons ───────────────────────────────────────────
                HStack {
                    if step > 0 {
                        Button("Back") {
                            withAnimation { step -= 1 }
                        }
                        .foregroundColor(.secondary)
                    }
                    Spacer()
                    if step < totalSteps - 1 {
                        Button("Next") {
                            withAnimation { step += 1 }
                        }
                        .buttonStyle(.borderedProminent)
                    } else {
                        Button {
                            Task { await save() }
                        } label: {
                            if isSaving {
                                ProgressView().frame(width: 120)
                            } else {
                                Text("Save & Get My Plan")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isSaving)
                    }
                }
                .padding()
            }
            .navigationTitle(stepTitle)
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Step 1: About You

    private var step1: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Tell us a bit about yourself so we can build the right plan.")
                .foregroundColor(.secondary)

            // Units — pick this first so height/weight fields respond immediately
            VStack(alignment: .leading, spacing: 6) {
                Label("Units", systemImage: "ruler.fill")
                    .font(.subheadline).bold()
                Picker("Units", selection: $unitSystem) {
                    ForEach(UnitSystem.allCases, id: \.self) { us in
                        Text(us.label).tag(us)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: unitSystem) { _, newSystem in
                    syncDisplayValues(to: newSystem)
                }
            }

            // Age
            VStack(alignment: .leading, spacing: 6) {
                Label("Age", systemImage: "person")
                    .font(.subheadline).bold()
                Stepper("\(age) years", value: $age, in: 18...80)
            }

            // Sex
            VStack(alignment: .leading, spacing: 6) {
                Label("Sex", systemImage: "figure.stand")
                    .font(.subheadline).bold()
                Picker("Sex", selection: $sex) {
                    Text("Male").tag("male")
                    Text("Female").tag("female")
                    Text("Other").tag("other")
                }
                .pickerStyle(.segmented)
            }

            // Height — metric: single cm stepper / imperial: ft + in steppers
            VStack(alignment: .leading, spacing: 6) {
                Label("Height", systemImage: "ruler")
                    .font(.subheadline).bold()
                if unitSystem == .metric {
                    Stepper("\(Int(heightCm)) cm", value: $heightCm, in: 140...220, step: 1)
                } else {
                    HStack(spacing: 24) {
                        Stepper("\(heightFt) ft", value: $heightFt, in: 4...7)
                            .fixedSize()
                            .onChange(of: heightFt) { _, _ in syncHeightCm() }
                        Stepper("\(heightIn) in", value: $heightIn, in: 0...11)
                            .fixedSize()
                            .onChange(of: heightIn) { _, _ in syncHeightCm() }
                    }
                }
            }

            // Weight
            VStack(alignment: .leading, spacing: 6) {
                Label("Current weight", systemImage: "scalemass")
                    .font(.subheadline).bold()
                Stepper(
                    String(format: "%.1f \(unitSystem.weightUnit)", weightDisplay),
                    value: $weightDisplay,
                    in: unitSystem.weightRange,
                    step: unitSystem.weightStep
                )
            }
        }
    }

    // MARK: - Step 2: Training

    private var step2: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("We'll use this to set the right starting weights and volume.")
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 6) {
                Label("Training experience", systemImage: "dumbbell")
                    .font(.subheadline).bold()
                Picker("Level", selection: $trainingLevel) {
                    Text("Beginner").tag("beginner")
                    Text("Intermediate").tag("intermediate")
                    Text("Advanced").tag("advanced")
                }
                .pickerStyle(.segmented)
                trainingLevelHint
            }

            VStack(alignment: .leading, spacing: 6) {
                Label("Days per week", systemImage: "calendar")
                    .font(.subheadline).bold()
                Stepper("\(daysPerWeek) days", value: $daysPerWeek, in: 2...4)
                Text("2–4 days. GLP-1 users recover more slowly — less is more.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("Equipment available", systemImage: "wrench.and.screwdriver")
                    .font(.subheadline).bold()
                ForEach(equipmentOptions, id: \.0) { key, label in
                    Button {
                        if equipment.contains(key) { equipment.remove(key) }
                        else { equipment.insert(key) }
                    } label: {
                        HStack {
                            Image(systemName: equipment.contains(key) ? "checkmark.square.fill" : "square")
                                .foregroundColor(equipment.contains(key) ? .blue : .secondary)
                            Text(label).foregroundColor(.primary)
                            Spacer()
                        }
                    }
                }
            }
        }
    }

    // MARK: - Step 3: GLP-1

    private var step3: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Your GLP-1 schedule shapes when we program your hardest sessions.")
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 6) {
                Label("Medication", systemImage: "pills")
                    .font(.subheadline).bold()
                Picker("Medication", selection: $glpDrug) {
                    Text("Semaglutide (Ozempic / Wegovy)").tag("Semaglutide")
                    Text("Tirzepatide (Mounjaro / Zepbound)").tag("Tirzepatide")
                    Text("Other").tag("Other")
                }
                .pickerStyle(.menu)
            }

            VStack(alignment: .leading, spacing: 6) {
                Label("Current dose (mg)", systemImage: "syringe")
                    .font(.subheadline).bold()
                TextField("e.g. 1.0", text: $glpDoseMgText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 6) {
                Label("Injection day", systemImage: "calendar.badge.clock")
                    .font(.subheadline).bold()
                Picker("Injection day", selection: $injectionDay) {
                    ForEach(0..<7) { i in Text(dayNames[i]).tag(i) }
                }
                .pickerStyle(.menu)
                Text("We'll schedule your hardest session as far from this day as possible.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 6) {
                Label("When did you start GLP-1?", systemImage: "calendar")
                    .font(.subheadline).bold()
                DatePicker("Start date", selection: $glpStartDate, displayedComponents: .date)
                    .labelsHidden()
            }
        }
    }

    // MARK: - Helpers

    private var stepTitle: String {
        switch step {
        case 0:  return "About You"
        case 1:  return "Your Training"
        default: return "Your GLP-1"
        }
    }

    private var trainingLevelHint: some View {
        let hint: String
        switch trainingLevel {
        case "beginner":     hint = "Less than 1 year of consistent training."
        case "intermediate": hint = "1–3 years. You know the main lifts."
        default:             hint = "3+ years. Comfortable with advanced programming."
        }
        return Text(hint).font(.caption).foregroundColor(.secondary)
    }

    /// Called when the unit system toggle changes. Re-expresses the display
    /// values in the new units without changing the underlying metric ground truth.
    private func syncDisplayValues(to newSystem: UnitSystem) {
        // Weight: re-express current kg ground truth in new units
        weightDisplay = newSystem.displayWeight(weightKg)

        // Height: re-express current cm in new ft/in values
        if newSystem == .imperial {
            let (ft, inches) = UnitSystem.cmToFtIn(heightCm)
            heightFt = ft
            heightIn = inches
        }
        // (When switching back to metric, heightCm is already the ground truth.)
    }

    /// Keeps heightCm in sync whenever the imperial ft/in steppers change.
    private func syncHeightCm() {
        heightCm = UnitSystem.ftInToCm(feet: heightFt, inches: heightIn)
    }

    // MARK: - Save

    private func save() async {
        isSaving = true
        saveError = nil

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let doseMgString = glpDoseMgText.trimmingCharacters(in: .whitespaces).isEmpty
            ? nil : glpDoseMgText

        let body = UpsertProfileBody(
            age: age,
            sex: sex,
            height_cm: heightCm,
            current_weight_kg: weightKg,
            starting_weight_kg: weightKg,
            goal_body_fat_pct: nil,
            training_history_level: trainingLevel,
            days_per_week: daysPerWeek,
            equipment_available: Array(equipment),
            glp_drug: glpDrug,
            glp_current_dose_mg: doseMgString,
            glp_injection_day_of_week: injectionDay,
            glp_start_date: dateFormatter.string(from: glpStartDate),
            last_dose_change_date: nil,
            unit_system: unitSystem.rawValue
        )

        do {
            _ = try await APIClient.shared.upsertProfile(userId: appState.userId, body: body)
            await MainActor.run {
                appState.unitSystem = unitSystem
                appState.showingOnboarding = false
            }
        } catch {
            saveError = error.localizedDescription
        }

        isSaving = false
    }
}

#Preview {
    OnboardingView()
        .environmentObject(AppState())
}
