// MacroCard.swift
// Shows the user's daily macro targets (protein, fat, carbs, calorie floor).
// Fetched fresh each time Today loads. If no profile exists yet, stays hidden.

import SwiftUI

struct MacroCard: View {
    let userId: String

    @State private var result: MacroResult? = nil
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                loadingShell
            } else if let m = result {
                content(m)
            }
            // if nil and not loading, profile missing — show nothing
        }
        .task { await load() }
    }

    // MARK: - Loading shell (keeps layout stable while fetching)

    private var loadingShell: some View {
        HStack(spacing: 0) {
            ForEach(0..<4) { _ in
                VStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.tertiarySystemFill))
                        .frame(width: 48, height: 22)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.tertiarySystemFill))
                        .frame(width: 36, height: 12)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    // MARK: - Content

    private func content(_ m: MacroResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Daily Targets", systemImage: "fork.knife")
                .font(.headline)

            HStack(spacing: 0) {
                MacroTile(
                    value: "\(m.protein_g)g",
                    label: "Protein",
                    color: .blue
                )
                MacroTile(
                    value: "\(m.fat_g)g",
                    label: "Fat",
                    color: .orange
                )
                MacroTile(
                    value: "\(m.carbs_g)g",
                    label: "Carbs",
                    color: .green
                )
                MacroTile(
                    value: "\(m.calories_floor)",
                    label: "Cal floor",
                    color: .purple
                )
            }

            if let notes = m.notes, !notes.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(notes, id: \.self) { note in
                        HStack(alignment: .top, spacing: 6) {
                            Text("·")
                                .foregroundColor(.secondary)
                            Text(note)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    // MARK: - Fetch

    private func load() async {
        isLoading = true
        result = try? await APIClient.shared.getMacros(userId: userId)
        isLoading = false
    }
}

// MARK: - MacroTile

private struct MacroTile: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3).bold()
                .foregroundColor(color)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    MacroCard(userId: "test-user-001")
        .padding()
}
