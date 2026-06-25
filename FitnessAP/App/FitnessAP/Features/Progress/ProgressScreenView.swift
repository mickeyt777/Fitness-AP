// ProgressScreenView.swift
// Tab 4 — weight trend, body measurements, and daily wellness check-in charts.
// Named ProgressScreenView to avoid conflicting with SwiftUI's built-in ProgressView.

import SwiftUI
import Charts

// MARK: - Time range

private enum TimeRange: String, CaseIterable {
    case week = "1W", month = "1M", threeMonths = "3M", all = "All"

    var weeks: Int {
        switch self {
        case .week:        return 1
        case .month:       return 4
        case .threeMonths: return 13
        case .all:         return 520
        }
    }

    var days: Int { weeks * 7 }
}

// MARK: - Measurement metric (for the body measurements chart picker)

private enum BodyMetric: String, CaseIterable {
    case waist = "Waist", hip = "Hip", chest = "Chest", arm = "Arm", thigh = "Thigh"

    func value(from m: BodyMeasurement) -> Double? {
        switch self {
        case .waist:  return m.waist_cm
        case .hip:    return m.hip_cm
        case .chest:  return m.chest_cm
        case .arm:    return m.arm_cm
        case .thigh:  return m.thigh_cm
        }
    }
}

// MARK: - Date helper

private let isoDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.locale = Locale(identifier: "en_US_POSIX")
    return f
}()

private extension String {
    var asProgressDate: Date? { isoDateFormatter.date(from: self) }
}

// MARK: - ProgressScreenView

struct ProgressScreenView: View {
    @EnvironmentObject var appState: AppState

    @State private var timeRange: TimeRange = .month
    @State private var measurements: [BodyMeasurement] = []
    @State private var checkins: [CheckIn] = []
    @State private var activityDaily: [DailyActivityPoint] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showLogForm = false
    @State private var showUnitSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && measurements.isEmpty && checkins.isEmpty {
                    ProgressView("Loading…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    scrollContent
                }
            }
            .navigationTitle("Progress")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showUnitSettings = true
                    } label: {
                        Image(systemName: "ruler")
                            .font(.body)
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { showLogForm.toggle() }
                    } label: {
                        Image(systemName: showLogForm ? "xmark.circle.fill" : "plus.circle.fill")
                            .font(.title3)
                    }
                }
            }
            .sheet(isPresented: $showUnitSettings) {
                UnitSettingsSheet(isPresented: $showUnitSettings)
            }
        }
        .task { await loadData() }
        .onChange(of: timeRange) { _, _ in Task { await loadData() } }
        .onChange(of: appState.unitSystem) { _, _ in
            // Charts and labels re-render automatically via @EnvironmentObject.
        }
    }

    // MARK: - Scroll content

    private var scrollContent: some View {
        ScrollView {
            VStack(spacing: 20) {

                // Time range picker
                Picker("Time Range", selection: $timeRange) {
                    ForEach(TimeRange.allCases, id: \.self) { range in
                        Text(range.rawValue).tag(range)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 4)

                // Inline log form
                if showLogForm {
                    LogEntryCard(userId: appState.userId, unitSystem: appState.unitSystem) { newMeasurement in
                        measurements.insert(newMeasurement, at: 0)
                        withAnimation { showLogForm = false }
                    }
                    .padding(.horizontal)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                if let error = errorMessage {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.orange)
                        Text(error).font(.caption).foregroundColor(.secondary)
                    }
                    .padding()
                }

                WeightSection(measurements: measurements, unitSystem: appState.unitSystem)
                    .padding(.horizontal)

                BodyMeasurementsSection(measurements: measurements, unitSystem: appState.unitSystem)
                    .padding(.horizontal)

                ActivitySection(daily: activityDaily)
                    .padding(.horizontal)

                WellnessSection(checkins: checkins)
                    .padding(.horizontal)
            }
            .padding(.bottom, 8)
        }
        .contentMargins(.bottom, 110, for: .scrollContent)
        .refreshable { await loadData() }
    }

    // MARK: - Data loading

    private func loadData() async {
        isLoading = true
        errorMessage = nil
        async let mTask = APIClient.shared.getMeasurements(userId: appState.userId, weeks: timeRange.weeks)
        async let cTask = APIClient.shared.getCheckins(userId: appState.userId, days: timeRange.days)
        // Activity is supplementary — a failure here must not blank the weight/measurement screen.
        async let aTask = APIClient.shared.getActivitySummary(userId: appState.userId, days: timeRange.days)
        do {
            let (m, c) = try await (mTask, cTask)
            measurements = m
            checkins = c
        } catch {
            errorMessage = error.localizedDescription
        }
        activityDaily = (try? await aTask)?.daily ?? []
        isLoading = false
    }
}

// MARK: - Unit settings sheet

private struct UnitSettingsSheet: View {
    @EnvironmentObject var appState: AppState
    @Binding var isPresented: Bool

    @State private var selectedSystem: UnitSystem = .metric
    @State private var isSaving = false
    @State private var saveError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Units", selection: $selectedSystem) {
                        ForEach(UnitSystem.allCases, id: \.self) { us in
                            Text(us.label).tag(us)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    Text("Display units")
                } footer: {
                    Text("The app always stores values in metric. Switching units converts how numbers are displayed.")
                }

                if let err = saveError {
                    Section {
                        Text(err).foregroundColor(.red).font(.caption)
                    }
                }
            }
            .navigationTitle("Units")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(isSaving)
                }
            }
            .onAppear { selectedSystem = appState.unitSystem }
        }
    }

    private func save() async {
        isSaving = true
        saveError = nil

        // Fetch current profile, update just the unit_system field, and PUT it back.
        do {
            let profile = try await APIClient.shared.getProfile(userId: appState.userId)
            var body = UpsertProfileBody(
                age: profile.age,
                sex: profile.sex,
                height_cm: profile.height_cm,
                current_weight_kg: profile.current_weight_kg,
                starting_weight_kg: profile.starting_weight_kg,
                goal_body_fat_pct: profile.goal_body_fat_pct,
                training_history_level: profile.training_history_level,
                days_per_week: profile.days_per_week,
                equipment_available: profile.equipment_available,
                glp_drug: profile.glp_drug,
                glp_current_dose_mg: profile.glp_current_dose_mg,
                glp_injection_day_of_week: profile.glp_injection_day_of_week,
                glp_start_date: profile.glp_start_date,
                last_dose_change_date: profile.last_dose_change_date,
                unit_system: selectedSystem.rawValue
            )
            _ = try await APIClient.shared.upsertProfile(userId: appState.userId, body: body)
            await MainActor.run {
                appState.unitSystem = selectedSystem
                isPresented = false
            }
        } catch {
            saveError = error.localizedDescription
        }

        isSaving = false
    }
}

// MARK: - Log entry card

private struct LogEntryCard: View {
    let userId: String
    let unitSystem: UnitSystem
    let onSaved: (BodyMeasurement) -> Void

    @State private var weightStr = ""
    @State private var waistStr  = ""
    @State private var hipStr    = ""
    @State private var chestStr  = ""
    @State private var armStr    = ""
    @State private var thighStr  = ""
    @State private var showMeasurements = false
    @State private var isSaving = false
    @State private var saveError: String?
    @FocusState private var focusedField: Field?

    private enum Field { case weight, waist, hip, chest, arm, thigh }

    private var hasAnyValue: Bool {
        [weightStr, waistStr, hipStr, chestStr, armStr, thighStr].contains { !$0.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            Text("Log Today")
                .font(.headline)
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 12)

            Divider()

            // Weight
            measurementRow(
                label: "Weight",
                unit: unitSystem.weightUnit,
                text: $weightStr,
                focus: .weight
            )

            // Body measurements toggle
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showMeasurements.toggle() }
            } label: {
                HStack {
                    Text("Body measurements")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Spacer()
                    Image(systemName: showMeasurements ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .buttonStyle(.plain)

            if showMeasurements {
                let u = unitSystem.lengthUnit
                Divider().padding(.leading, 16)
                measurementRow(label: "Waist", unit: u, text: $waistStr, focus: .waist)
                Divider().padding(.leading, 16)
                measurementRow(label: "Hip",   unit: u, text: $hipStr,   focus: .hip)
                Divider().padding(.leading, 16)
                measurementRow(label: "Chest", unit: u, text: $chestStr, focus: .chest)
                Divider().padding(.leading, 16)
                measurementRow(label: "Arm",   unit: u, text: $armStr,   focus: .arm)
                Divider().padding(.leading, 16)
                measurementRow(label: "Thigh", unit: u, text: $thighStr, focus: .thigh)
            }

            if let err = saveError {
                Text(err)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }

            Divider()

            Button {
                Task { await save() }
            } label: {
                Group {
                    if isSaving { ProgressView() }
                    else { Text("Save").fontWeight(.semibold) }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
            .foregroundColor(hasAnyValue ? .accentColor : .secondary)
            .disabled(!hasAnyValue || isSaving)
            .padding(.bottom, 2)
        }
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    @ViewBuilder
    private func measurementRow(
        label: String,
        unit: String,
        text: Binding<String>,
        focus: Field
    ) -> some View {
        HStack {
            Text(label).foregroundColor(.secondary)
            Spacer()
            TextField("0.0", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .focused($focusedField, equals: focus)
                .frame(width: 80)
            Text(unit)
                .foregroundColor(.secondary)
                .frame(width: 32, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func save() async {
        focusedField = nil
        isSaving = true
        saveError = nil

        // Parse entered values (already in display units) and convert to metric for storage.
        func parseWeight(_ s: String) -> Double? {
            guard let v = Double(s) else { return nil }
            return unitSystem.storeWeight(v)
        }
        func parseLength(_ s: String) -> Double? {
            guard let v = Double(s) else { return nil }
            return unitSystem.storeLength(v)
        }

        let body = LogMeasurementBody(
            taken_at:  nil,
            weight_kg: parseWeight(weightStr),
            waist_cm:  parseLength(waistStr),
            hip_cm:    parseLength(hipStr),
            chest_cm:  parseLength(chestStr),
            arm_cm:    parseLength(armStr),
            thigh_cm:  parseLength(thighStr)
        )

        do {
            let response = try await APIClient.shared.logMeasurement(userId: userId, body: body)
            onSaved(response.measurement)
            weightStr = ""; waistStr = ""; hipStr = ""
            chestStr  = ""; armStr   = ""; thighStr = ""
        } catch {
            saveError = error.localizedDescription
        }
        isSaving = false
    }
}

// MARK: - Weight chart section

private struct WeightSection: View {
    let measurements: [BodyMeasurement]
    let unitSystem: UnitSystem

    private var points: [(date: Date, value: Double)] {
        measurements.compactMap { m in
            guard let d = m.taken_at.asProgressDate, let w = m.weight_kg else { return nil }
            return (d, unitSystem.displayWeight(w))
        }
        .sorted { $0.date < $1.date }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Body Weight", systemImage: "scalemass")
                .font(.headline)

            if points.isEmpty {
                progressEmptyState("No weight entries yet — tap + to log your first.")
            } else {
                let unit = unitSystem.weightUnit
                Chart(points, id: \.date) { point in
                    LineMark(
                        x: .value("Date", point.date),
                        y: .value(unit, point.value)
                    )
                    .foregroundStyle(Color.accentColor)
                    .interpolationMethod(.catmullRom)

                    PointMark(
                        x: .value("Date", point.date),
                        y: .value(unit, point.value)
                    )
                    .foregroundStyle(Color.accentColor)
                    .symbolSize(30)
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel { Text("\(value.as(Double.self).map { Int($0) } ?? 0) \(unit)") }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    }
                }
                .frame(height: 180)

                if let latest = points.last, let first = points.first, points.count >= 2 {
                    let deltaDisplay = latest.value - first.value
                    let sign = deltaDisplay < 0 ? "" : "+"
                    Text("\(sign)\(String(format: "%.1f", deltaDisplay)) \(unit) over this period")
                        .font(.caption)
                        .foregroundColor(deltaDisplay < 0 ? .green : .secondary)
                }
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Body measurements chart section

private struct BodyMeasurementsSection: View {
    let measurements: [BodyMeasurement]
    let unitSystem: UnitSystem

    @State private var selectedMetric: BodyMetric = .waist

    private func points(for metric: BodyMetric) -> [(date: Date, value: Double)] {
        measurements.compactMap { m in
            guard let d = m.taken_at.asProgressDate, let v = metric.value(from: m) else { return nil }
            return (d, unitSystem.displayLength(v))
        }
        .sorted { $0.date < $1.date }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Body Measurements", systemImage: "ruler")
                .font(.headline)

            Picker("Metric", selection: $selectedMetric) {
                ForEach(BodyMetric.allCases, id: \.self) { m in
                    Text(m.rawValue).tag(m)
                }
            }
            .pickerStyle(.segmented)

            let pts  = points(for: selectedMetric)
            let unit = unitSystem.lengthUnit

            if pts.isEmpty {
                progressEmptyState("No \(selectedMetric.rawValue.lowercased()) entries yet — tap + to log.")
            } else {
                Chart(pts, id: \.date) { point in
                    LineMark(
                        x: .value("Date", point.date),
                        y: .value(unit, point.value)
                    )
                    .foregroundStyle(Color.orange)
                    .interpolationMethod(.catmullRom)

                    PointMark(
                        x: .value("Date", point.date),
                        y: .value(unit, point.value)
                    )
                    .foregroundStyle(Color.orange)
                    .symbolSize(30)
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel { Text("\(value.as(Double.self).map { String(format: "%.1f", $0) } ?? "") \(unit)") }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    }
                }
                .frame(height: 180)

                if let latest = pts.last, let first = pts.first, pts.count >= 2 {
                    let delta = latest.value - first.value
                    let sign  = delta < 0 ? "" : "+"
                    let isGood = selectedMetric == .waist ? delta < 0 : abs(delta) < 1
                    Text("\(sign)\(String(format: "%.1f", delta)) \(unit) over this period")
                        .font(.caption)
                        .foregroundColor(isGood ? .green : .secondary)
                }
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Wellness (check-in) section

private struct WellnessSection: View {
    let checkins: [CheckIn]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Daily Wellness", systemImage: "heart.text.square")
                .font(.headline)

            if checkins.isEmpty {
                progressEmptyState("No check-ins logged in this period.")
            } else {
                HStack(spacing: 12) {
                    WellnessTile(
                        title: "Energy", systemImage: "bolt.fill", color: .yellow,
                        points: checkins.compactMap { c in
                            guard let d = c.date.asProgressDate, let v = c.energy_1_10 else { return nil }
                            return (d, Double(v))
                        }.sorted { $0.0 < $1.0 },
                        domain: 1...10
                    )
                    WellnessTile(
                        title: "Sleep", systemImage: "moon.fill", color: .indigo,
                        points: checkins.compactMap { c in
                            guard let d = c.date.asProgressDate, let v = c.sleep_hours else { return nil }
                            return (d, v)
                        }.sorted { $0.0 < $1.0 },
                        domain: 0...12
                    )
                    WellnessTile(
                        title: "Nausea", systemImage: "waveform.path.ecg", color: .red,
                        points: checkins.compactMap { c in
                            guard let d = c.date.asProgressDate, let v = c.nausea_1_10 else { return nil }
                            return (d, Double(v))
                        }.sorted { $0.0 < $1.0 },
                        domain: 1...10
                    )
                }
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Wellness sparkline tile

private struct WellnessTile: View {
    let title: String
    let systemImage: String
    let color: Color
    let points: [(Date, Double)]
    let domain: ClosedRange<Double>

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: systemImage).font(.caption2).foregroundColor(color)
                Text(title).font(.caption2).foregroundColor(.secondary)
            }

            if points.isEmpty {
                Text("–").font(.title3).fontWeight(.semibold).foregroundColor(.secondary)
                Spacer()
            } else {
                if let val = points.last?.1 {
                    Text(String(format: val == val.rounded() ? "%.0f" : "%.1f", val))
                        .font(.title3).fontWeight(.semibold)
                }
                Chart(points, id: \.0) { point in
                    LineMark(x: .value("Date", point.0), y: .value("Value", point.1))
                        .foregroundStyle(color)
                        .interpolationMethod(.catmullRom)
                }
                .chartYScale(domain: domain)
                .chartXAxis(.hidden)
                .chartYAxis(.hidden)
                .frame(height: 44)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemBackground))
        .cornerRadius(10)
    }
}

// MARK: - Activity (steps + active energy) section
// Driven by GET /activity/:userId/summary → daily[]. Units are HealthKit-native
// (steps are counts, energy is kcal) so no UnitSystem conversion is needed here.

private struct ActivitySection: View {
    let daily: [DailyActivityPoint]

    private func points(_ value: (DailyActivityPoint) -> Double?) -> [(date: Date, value: Double)] {
        daily.compactMap { d in
            guard let date = d.date.asProgressDate, let v = value(d) else { return nil }
            return (date, v)
        }
        .sorted { $0.date < $1.date }
    }

    private static let stepFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f
    }()

    var body: some View {
        let stepPts   = points { $0.steps.map(Double.init) }
        let energyPts = points { $0.active_energy_kcal }

        VStack(alignment: .leading, spacing: 12) {
            Label("Activity", systemImage: "figure.walk")
                .font(.headline)

            if stepPts.isEmpty && energyPts.isEmpty {
                progressEmptyState("No activity data yet — connect Apple Health or log steps to see trends.")
            } else {
                ActivityMetricRow(
                    title: "Steps",
                    systemImage: "shoeprints.fill",
                    color: .green,
                    points: stepPts,
                    style: .bar,
                    formatValue: { v in
                        let n = Self.stepFormatter.string(from: NSNumber(value: Int(v.rounded()))) ?? "\(Int(v))"
                        return "\(n) steps"
                    }
                )
                Divider()
                ActivityMetricRow(
                    title: "Active Energy",
                    systemImage: "flame.fill",
                    color: .orange,
                    points: energyPts,
                    style: .line,
                    formatValue: { "\(Int($0.rounded())) kcal" }
                )
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Activity sparkline row

private struct ActivityMetricRow: View {
    enum Style { case bar, line }

    let title: String
    let systemImage: String
    let color: Color
    let points: [(date: Date, value: Double)]
    let style: Style
    let formatValue: (Double) -> String

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: systemImage).font(.caption2).foregroundColor(color)
                    Text(title).font(.caption).foregroundColor(.secondary)
                }
                if let last = points.last?.value {
                    Text(formatValue(last)).font(.title3).fontWeight(.semibold)
                } else {
                    Text("–").font(.title3).fontWeight(.semibold).foregroundColor(.secondary)
                }
            }
            .frame(width: 120, alignment: .leading)

            if points.count >= 2 {
                chart
                    .chartXAxis(.hidden)
                    .chartYAxis(.hidden)
                    .frame(height: 48)
            } else {
                Text("Not enough data yet")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .frame(height: 48)
            }
        }
    }

    // The bar/line choice is made HERE, at the View level (@ViewBuilder fully
    // supports `switch`), not inside the Chart content closure. A `switch` inside
    // @ChartContentBuilder fails the ChartContent conformance at runtime and traps
    // with SIGABRT ("subject type 'x' does not conform to protocol 'ChartContent'").
    @ViewBuilder
    private var chart: some View {
        switch style {
        case .bar:
            Chart(points, id: \.date) { point in
                BarMark(
                    x: .value("Date", point.date),
                    y: .value(title, point.value)
                )
                .foregroundStyle(color.opacity(0.85))
            }
        case .line:
            Chart(points, id: \.date) { point in
                LineMark(
                    x: .value("Date", point.date),
                    y: .value(title, point.value)
                )
                .foregroundStyle(color)
                .interpolationMethod(.catmullRom)
                AreaMark(
                    x: .value("Date", point.date),
                    y: .value(title, point.value)
                )
                .foregroundStyle(color.opacity(0.12))
                .interpolationMethod(.catmullRom)
            }
        }
    }
}

// MARK: - Shared empty state helper

private func progressEmptyState(_ message: String) -> some View {
    HStack(spacing: 8) {
        Image(systemName: "chart.line.uptrend.xyaxis").foregroundColor(.secondary)
        Text(message).font(.caption).foregroundColor(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 8)
}

// MARK: - Preview

#Preview {
    ProgressScreenView()
        .environmentObject({
            let s = AppState()
            s.signIn(userId: "test-user-001")
            return s
        }())
}
