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
    @State private var age: Int = 35
    @State private var sex: String = "male"
    @State private var heightCm: Double = 170
    @State private var weightKg: Double = 90

    // Step 2 — Training
    @State private var trainingLevel: String = "beginner"
    @State private var daysPerWeek: Int = 3
    @State private var equipment: Set<String> = ["bodyweight", "dumbbells"]

    // Step 3 — GLP-1
    @State private var glpDrug: String = "Semaglutide"
    @State private var glpDoseMgText: String = ""
    @State private var injectionDay: Int = 1          // 0=Sun … 6=Sat
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

                // ── Error ─────────────────────────────────────────────────
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
                                ProgressView()
                                    .frame(width: 120)
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

    // MARK: - Step views

    private var step1: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Tell us a bit about yourself so we can build the right plan.")
                .foregroundColor(.secondary)

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

            // Height
            VStack(alignment: .leading, spacing: 6) {
                Label("Height", systemImage: "ruler")
                    .font(.subheadline).bold()
                HStack {
                    Stepper("\(Int(heightCm)) cm", value: $heightCm, in: 140...220, step: 1)
                }
            }

            // Weight
            VStack(alignment: .leading, spacing: 6) {
                Label("Current weight", systemImage: "scalemass")
                    .font(.subheadline).bold()
                Stepper(String(format: "%.1f kg", weightKg), value: $weightKg, in: 40...250, step: 0.5)
            }
        }
    }

    private var step2: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("We'll use this to set the right starting weights and volume.")
                .foregroundColor(.secondary)

            // Training level
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

            // Days per week
            VStack(alignment: .leading, spacing: 6) {
                Label("Days per week", systemImage: "calendar")
                    .font(.subheadline).bold()
                Stepper("\(daysPerWeek) days", value: $daysPerWeek, in: 2...4)
                Text("2–4 days. GLP-1 users recover more slowly — less is more.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Equipment
            VStack(alignment: .leading, spacing: 10) {
                Label("Equipment available", systemImage: "wrench.and.screwdriver")
                    .font(.subheadline).bold()
                ForEach(equipmentOptions, id: \.0) { key, label in
                    Button {
                        if equipment.contains(key) {
                            equipment.remove(key)
                        } else {
                            equipment.insert(key)
                        }
                    } label: {
                        HStack {
                            Image(systemName: equipment.contains(key) ? "checkmark.square.fill" : "square")
                                .foregroundColor(equipment.contains(key) ? .blue : .secondary)
                            Text(label)
                                .foregroundColor(.primary)
                            Spacer()
                        }
                    }
                }
            }
        }
    }

    private var step3: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Your GLP-1 schedule shapes when we program your hardest sessions.")
                .foregroundColor(.secondary)

            // Drug
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

            // Current dose
            VStack(alignment: .leading, spacing: 6) {
                Label("Current dose (mg)", systemImage: "syringe")
                    .font(.subheadline).bold()
                TextField("e.g. 1.0", text: $glpDoseMgText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
            }

            // Injection day
            VStack(alignment: .leading, spacing: 6) {
                Label("Injection day", systemImage: "calendar.badge.clock")
                    .font(.subheadline).bold()
                Picker("Injection day", selection: $injectionDay) {
                    ForEach(0..<7) { i in
                        Text(dayNames[i]).tag(i)
                    }
                }
                .pickerStyle(.menu)
                Text("We'll schedule your hardest session as far from this day as possible.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Start date
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
        return Text(hint)
            .font(.caption)
            .foregroundColor(.secondary)
    }

    // MARK: - Save

    private func save() async {
        isSaving = true
        saveError = nil

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let doseMgString = glpDoseMgText.trimmingCharacters(in: .whitespaces).isEmpty ? nil : glpDoseMgText

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
            last_dose_change_date: nil
        )

        do {
            _ = try await APIClient.shared.upsertProfile(userId: appState.userId, body: body)
            appState.showingOnboarding = false
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
