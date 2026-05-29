// ProgressScreenView.swift
// Tab 4 — measurements, progress photos, weekly report.
// Named ProgressScreenView to avoid conflicting with SwiftUI's built-in ProgressView.
// Placeholder for now.

import SwiftUI

struct ProgressScreenView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 48))
                    .foregroundColor(.secondary)
                Text("Progress")
                    .font(.headline)
                Text("Measurements, photos, and weekly reports coming soon.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Progress")
        }
    }
}

#Preview {
    ProgressScreenView()
}
