// CheckInCard.swift
// Daily check-in card shown at the top of the Today screen.
// Loads today's existing check-in on appear, lets the user adjust and save.
// If the backend flags a deload, shows a banner below the sliders.

import SwiftUI

struct CheckInCard: View {
    let userId: String

    // Slider values — all start at midpoint until today's data loads
    @State private var energy: Double       = 5
    @State private var nausea: Double       = 1
    @State private var giSymptoms: Double   = 1
    @State private var sleepHours: Double   = 7
    @State private var notes: String        = ""

    @State private var isSaving    = false
    @State private var isLoading   = true
    @State private var saved       = false          // shows a brief checkmark after save
    @State private var deloadNote: String?          // non-nil → deload banner

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {

            // ── Header ────────────────────────────────────────────────────
            HStack {
                Label("Daily Check-In", systemImage: "chart.bar.fill")
                    .font(.headline)
                Spacer()
                if isLoading {
                    ProgressView().scaleEffect(0.8)
                } else if saved {
                    Label("Saved", systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            }

            if !isLoading {
                // ── Sliders ───────────────────────────────────────────────
                SliderRow(
                    label: "Energy",
                    icon: "bolt.fill",
                    color: .yellow,
                    value: $energy,
                    range: 1...10,
                    lowLabel: "Drained",
                    highLabel: "Strong"
                )

                SliderRow(
                    label: "Nausea",
                    icon: "face.smiling",
                    color: .orange,
                    value: $nausea,
                    range: 1...10,
                    lowLabel: "None",
                    highLabel: "Severe"
                )

                SliderRow(
                    label: "GI symptoms",
                    icon: "waveform.path.ecg",
                    color: .red,
                    value: $giSymptoms,
                    range: 1...10,
                    lowLabel: "None",
                    highLabel: "Severe"
                )

                SliderRow(
                    label: "Sleep",
                    icon: "moon.fill",
                    color: .indigo,
                    value: $sleepHours,
                    range: 3...12,
                    step: 0.5,
                    lowLabel: "3 h",
                    highLabel: "12 h",
                    valueFormatter: { String(format: "%.1f h", $0) }
                )

                // ── Notes ─────────────────────────────────────────────────
                TextField("Notes (optional)", text: $notes, axis: .vertical)
                    .font(.subheadline)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...4)

                // ── Save button ───────────────────────────────────────────
                Button {
                    Task { await save() }
                } label: {
                    Group {
                        if isSaving {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Save check-in")
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSaving)

                // ── Deload banner ─────────────────────────────────────────
                if let note = deloadNote {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "arrow.down.circle.fill")
                            .foregroundColor(.orange)
                        Text(note)
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                    .padding(10)
                    .background(Color.orange.opacity(0.1))
                    .cornerRadius(8)
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
        .task { await loadToday() }
    }

    // MARK: - Data

    private func loadToday() async {
        isLoading = true
        if let checkin = try? await APIClient.shared.getTodayCheckin(userId: userId) {
            energy     = Double(checkin.energy_1_10     ?? 5)
            nausea     = Double(checkin.nausea_1_10     ?? 1)
            giSymptoms = Double(checkin.gi_symptoms_1_10 ?? 1)
            sleepHours = checkin.sleep_hours            ?? 7
            notes      = checkin.notes_text             ?? ""
        }
        isLoading = false
    }

    private func save() async {
        isSaving = true
        saved    = false
        let body = SubmitCheckinBody(
            energy_1_10:      Int(energy.rounded()),
            nausea_1_10:      Int(nausea.rounded()),
            gi_symptoms_1_10: Int(giSymptoms.rounded()),
            sleep_hours:      sleepHours,
            notes_text:       notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes
        )
        if let result = try? await APIClient.shared.submitCheckin(userId: userId, body: body) {
            saved = true
            if result.deload.deload, let reason = result.deload.reason {
                deloadNote = reason
            } else {
                deloadNote = nil
            }
            // Hide the "Saved" label after 2 seconds
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            saved = false
        }
        isSaving = false
    }
}

// MARK: - SliderRow

private struct SliderRow: View {
    let label: String
    let icon: String
    let color: Color
    @Binding var value: Double
    let range: ClosedRange<Double>
    var step: Double = 1
    let lowLabel: String
    let highLabel: String
    var valueFormatter: (Double) -> String = { String(Int($0.rounded())) }

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .frame(width: 18)
                Text(label)
                    .font(.subheadline)
                Spacer()
                Text(valueFormatter(value))
                    .font(.subheadline).bold()
                    .foregroundColor(color)
                    .frame(width: 44, alignment: .trailing)
            }
            HStack(spacing: 6) {
                Text(lowLabel)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Slider(value: $value, in: range, step: step)
                    .tint(color)
                Text(highLabel)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }
}

#Preview {
    CheckInCard(userId: "test-user-001")
        .padding()
}
