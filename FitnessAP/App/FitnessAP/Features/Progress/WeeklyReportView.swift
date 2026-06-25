// WeeklyReportView.swift
// The weekly-report screen — pushed from the Progress tab.
//
// Reads GET /reports/:userId/weekly for the structured summary and renders it as
// cards (lean-mass proxy headline first, per the product framing). The LLM
// narrative from POST /ai/weekly-report is on-demand behind a button, so we never
// pay for it unless the user wants it. Prev/next week navigation via week_end.
//
// Deliberately chart-free: this is a digest, not a trend view. (Trends live on the
// Progress tab.) Keeping it to cards also sidesteps the @ChartContentBuilder
// control-flow trap documented in ProgressScreenView.
//
// No paywall / free-paid gating here — that's Phase-3 work, intentionally deferred.

import SwiftUI

struct WeeklyReportView: View {
    @EnvironmentObject var appState: AppState

    @State private var weekOffset = 0          // 0 = current week, 1 = last week, …
    @State private var summary: WeeklySummary?
    @State private var isLoadingSummary = false
    @State private var errorMessage: String?

    @State private var narrative: String?
    @State private var isLoadingNarrative = false
    @State private var narrativeError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                weekSwitcher

                if isLoadingSummary && summary == nil {
                    ProgressView("Loading…")
                        .frame(maxWidth: .infinity, minHeight: 200)
                } else if let s = summary {
                    content(s)
                } else if let error = errorMessage {
                    errorState(error)
                }
            }
            .padding(.horizontal)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .navigationTitle("Weekly Report")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadSummary() }
    }

    // MARK: - Week switcher

    private var weekSwitcher: some View {
        HStack {
            Button {
                weekOffset += 1
                Task { await loadSummary() }
            } label: {
                Image(systemName: "chevron.left").font(.body.weight(.semibold))
            }

            Spacer()

            VStack(spacing: 2) {
                Text(weekOffset == 0 ? "This Week"
                     : weekOffset == 1 ? "Last Week"
                     : "\(weekOffset) Weeks Ago")
                    .font(.headline)
                if let p = summary?.period {
                    Text("\(prettyDate(p.start)) – \(prettyDate(p.end))")
                        .font(.caption).foregroundColor(.secondary)
                }
            }

            Spacer()

            Button {
                guard weekOffset > 0 else { return }
                weekOffset -= 1
                Task { await loadSummary() }
            } label: {
                Image(systemName: "chevron.right").font(.body.weight(.semibold))
            }
            .disabled(weekOffset == 0)
            .opacity(weekOffset == 0 ? 0.3 : 1)
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ s: WeeklySummary) -> some View {
        leanMassCard(s.lean_mass_proxy)
        coachNoteCard(s)
        workoutsCard(s.workouts)
        if !s.strength.isEmpty { strengthCard(s.strength) }
        activityCard(s.activity)
        checkinsCard(s.checkins)
        bodyWeightCard(s.body_weight)
        if s.drug_context.in_titration_window { titrationCard(s.drug_context) }
    }

    // MARK: - Lean-mass proxy (hero)

    private func leanMassCard(_ proxy: WeeklyLeanMassProxy) -> some View {
        let p = proxyPalette(proxy.score)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: p.icon).foregroundColor(p.color)
                Text("Lean-Mass Proxy").font(.subheadline.weight(.semibold))
                    .foregroundColor(.secondary)
                Spacer()
                if let score = proxy.score {
                    Text(score.capitalized)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(p.color.opacity(0.18))
                        .foregroundColor(p.color)
                        .clipShape(Capsule())
                }
            }
            Text(proxy.summary)
                .font(.body)
                .foregroundColor(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.color.opacity(0.10))
        .cornerRadius(12)
    }

    /// score → (accent, icon). green = the target outcome; flag = watch next week.
    private func proxyPalette(_ score: String?) -> (color: Color, icon: String) {
        switch score {
        case "green":  return (.green,  "checkmark.seal.fill")
        case "yellow": return (.orange, "exclamationmark.triangle.fill")
        case "hold":   return (.blue,   "equal.circle.fill")
        case "flag":   return (.red,    "flag.fill")
        default:       return (.secondary, "ruler")   // null — no measurement yet
        }
    }

    // MARK: - Coach's note (LLM narrative, on-demand)

    @ViewBuilder
    private func coachNoteCard(_ s: WeeklySummary) -> some View {
        sectionCard(title: "Coach's Note", systemImage: "text.bubble") {
            if let text = narrative {
                Text(text)
                    .font(.subheadline)
                    .foregroundColor(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            } else if isLoadingNarrative {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Writing your summary…").font(.caption).foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Get a written summary of your week in plain language.")
                        .font(.caption).foregroundColor(.secondary)
                    if let err = narrativeError {
                        Text(err).font(.caption).foregroundColor(.red)
                    }
                    Button {
                        Task { await loadNarrative(s) }
                    } label: {
                        Label("Write my summary", systemImage: "sparkles")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
    }

    // MARK: - Workouts

    private func workoutsCard(_ w: WeeklyWorkouts) -> some View {
        sectionCard(title: "Training", systemImage: "dumbbell") {
            HStack(spacing: 12) {
                statTile(value: w.adherence_pct.map { "\($0)%" } ?? "—",
                         label: "Adherence",
                         color: adherenceColor(w.adherence_pct))
                statTile(value: "\(w.completed)/\(w.planned)", label: "Sessions")
                statTile(value: w.avg_rpe.map { trim($0) } ?? "—", label: "Avg RPE")
            }
            if w.total_tonnage_kg > 0 {
                Text("Total work: \(grouped(w.total_tonnage_kg)) kg lifted")
                    .font(.caption).foregroundColor(.secondary)
                    .padding(.top, 2)
            }
        }
    }

    // MARK: - Strength progression

    private func strengthCard(_ rows: [WeeklyStrength]) -> some View {
        sectionCard(title: "Strength", systemImage: "chart.line.uptrend.xyaxis") {
            VStack(spacing: 10) {
                ForEach(rows) { r in
                    HStack {
                        Text(r.exercise_name)
                            .font(.subheadline).lineLimit(1)
                        Spacer()
                        if let kg = r.this_week_kg {
                            Text("\(trim(displayKg(kg))) \(appState.unitSystem.weightUnit)")
                                .font(.subheadline.weight(.semibold))
                        } else {
                            Text("—").foregroundColor(.secondary)
                        }
                        changeBadge(r.change_kg)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func changeBadge(_ changeKg: Double?) -> some View {
        if let c = changeKg, c != 0 {
            let up = c > 0
            let disp = displayKg(abs(c))
            Text("\(up ? "+" : "−")\(trim(disp))")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background((up ? Color.green : Color.secondary).opacity(0.15))
                .foregroundColor(up ? .green : .secondary)
                .clipShape(Capsule())
        } else if changeKg == 0 {
            Text("=").font(.caption.weight(.semibold)).foregroundColor(.secondary)
                .frame(width: 24)
        } else {
            Color.clear.frame(width: 0, height: 0)
        }
    }

    // MARK: - Activity

    private func activityCard(_ a: WeeklyActivity) -> some View {
        sectionCard(title: "Activity", systemImage: "figure.walk") {
            if a.days_logged == 0 && a.cardio_sessions == 0 {
                Text("No step or cardio data logged this week.")
                    .font(.caption).foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(spacing: 12) {
                    statTile(value: a.avg_steps.map { grouped($0) } ?? "—", label: "Avg steps")
                    statTile(value: "\(a.step_goal_hit_days)", label: "Goal days")
                    statTile(value: "\(a.cardio_minutes)", label: "Cardio min")
                }
                if a.cardio_sessions > 0 {
                    Text("\(a.cardio_sessions) cardio session\(a.cardio_sessions == 1 ? "" : "s") · "
                         + intensityBreakdown(a.cardio_by_intensity)
                         + (a.total_distance_km > 0 ? " · \(trim(a.total_distance_km)) km" : ""))
                        .font(.caption).foregroundColor(.secondary)
                        .padding(.top, 2)
                }
            }
        }
    }

    private func intensityBreakdown(_ c: CardioByIntensity) -> String {
        var parts: [String] = []
        if c.easy > 0 { parts.append("\(c.easy) easy") }
        if c.moderate > 0 { parts.append("\(c.moderate) moderate") }
        if c.hard > 0 { parts.append("\(c.hard) hard") }
        return parts.isEmpty ? "intensity not set" : parts.joined(separator: ", ")
    }

    // MARK: - Check-ins

    private func checkinsCard(_ c: WeeklyCheckins) -> some View {
        sectionCard(title: "Wellness", systemImage: "heart.text.square") {
            if c.days_logged == 0 {
                Text("No check-ins logged this week.")
                    .font(.caption).foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(spacing: 12) {
                    statTile(value: c.avg_energy.map { trim($0) } ?? "—", label: "Energy")
                    statTile(value: c.avg_sleep_hrs.map { "\(trim($0))h" } ?? "—", label: "Sleep")
                    statTile(value: "\(c.symptom_days)", label: "Symptom days",
                             color: c.symptom_days > 0 ? .orange : nil)
                }
                Text("\(c.days_logged)/7 days logged")
                    .font(.caption).foregroundColor(.secondary).padding(.top, 2)
            }
        }
    }

    // MARK: - Body weight

    private func bodyWeightCard(_ b: WeeklyBodyWeight) -> some View {
        sectionCard(title: "Body Weight", systemImage: "scalemass") {
            if b.this_week_kg == nil && b.trend_4wk_kg == nil {
                Text("No weight logged this week.")
                    .font(.caption).foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                let unit = appState.unitSystem.weightUnit
                HStack(spacing: 12) {
                    statTile(value: b.this_week_kg.map { "\(trim(displayKg($0))) \(unit)" } ?? "—",
                             label: "This week")
                    statTile(value: b.trend_4wk_kg.map { "\(trim(displayKg($0))) \(unit)" } ?? "—",
                             label: "4-wk trend")
                }
            }
        }
    }

    // MARK: - Titration note

    private func titrationCard(_ d: WeeklyDrugContext) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "info.circle.fill").foregroundColor(.blue)
            VStack(alignment: .leading, spacing: 2) {
                Text("Dose-adjustment week").font(.subheadline.weight(.semibold))
                Text(titrationText(d)).font(.caption).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.blue.opacity(0.10))
        .cornerRadius(12)
    }

    private func titrationText(_ d: WeeklyDrugContext) -> String {
        let drug = d.current_drug ?? "your medication"
        if let day = d.days_since_dose_change {
            return "You're \(day) day\(day == 1 ? "" : "s") into a \(drug) dose change. "
                 + "Appetite and energy can swing during this window — be kind to your numbers."
        }
        return "You're in a \(drug) titration window. Appetite and energy can swing — be kind to your numbers."
    }

    // MARK: - Reusable pieces

    @ViewBuilder
    private func sectionCard<Inner: View>(title: String, systemImage: String,
                                          @ViewBuilder _ inner: () -> Inner) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage).font(.headline)
            inner()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func statTile(value: String, label: String, color: Color? = nil) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.title3.weight(.semibold))
                .foregroundColor(color ?? .primary)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color(.tertiarySystemBackground))
        .cornerRadius(10)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle").font(.title2).foregroundColor(.orange)
            Text(message).font(.caption).foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await loadSummary() } }
                .font(.subheadline)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .padding()
    }

    // MARK: - Formatting helpers

    private func displayKg(_ kg: Double) -> Double { appState.unitSystem.displayWeight(kg) }

    /// Drops a trailing ".0" so 70.0 → "70" but 67.5 → "67.5".
    private func trim(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }

    private func grouped(_ n: Int) -> String {
        Self.groupFormatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    private static let groupFormatter: NumberFormatter = {
        let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0
        return f
    }()

    private func adherenceColor(_ pct: Int?) -> Color? {
        guard let p = pct else { return nil }
        if p >= 80 { return .green }
        if p >= 50 { return .orange }
        return .secondary
    }

    // "2026-06-25" → "Jun 25"
    private func prettyDate(_ iso: String) -> String {
        guard let d = Self.isoIn.date(from: iso) else { return iso }
        return Self.prettyOut.string(from: d)
    }

    private static let isoIn: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()
    private static let prettyOut: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "MMM d"; return f
    }()

    // MARK: - Loading

    /// week_end for the current offset. nil for this week (backend defaults to today).
    private var weekEndParam: String? {
        guard weekOffset > 0 else { return nil }
        let day = Calendar.current.date(byAdding: .day, value: -7 * weekOffset, to: Date()) ?? Date()
        return Self.isoIn.string(from: day)
    }

    private func loadSummary() async {
        isLoadingSummary = true
        errorMessage = nil
        // A new week invalidates the previously-generated narrative.
        narrative = nil
        narrativeError = nil
        do {
            summary = try await APIClient.shared.getWeeklySummary(
                userId: appState.userId, weekEnd: weekEndParam)
        } catch {
            summary = nil
            errorMessage = error.localizedDescription
        }
        isLoadingSummary = false
    }

    private func loadNarrative(_ s: WeeklySummary) async {
        isLoadingNarrative = true
        narrativeError = nil
        do {
            let resp = try await APIClient.shared.getWeeklyReportNarrative(
                userId: appState.userId, summary: s)
            narrative = resp.narrative
        } catch {
            narrativeError = error.localizedDescription
        }
        isLoadingNarrative = false
    }
}

#Preview {
    NavigationStack {
        WeeklyReportView()
            .environmentObject({
                let s = AppState()
                s.signIn(userId: "test-user-001")
                return s
            }())
    }
}
