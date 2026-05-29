// NutritionView.swift
// Tab 3 — macro targets and protein food leaderboard.
// Placeholder for now.

import SwiftUI

struct NutritionView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "fork.knife")
                    .font(.system(size: 48))
                    .foregroundColor(.secondary)
                Text("Nutrition")
                    .font(.headline)
                Text("Macro targets and food coaching coming soon.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Nutrition")
        }
    }
}

#Preview {
    NutritionView()
}
