// CoachView.swift
// Tab 5 — AI chat interface.
// Placeholder for now.

import SwiftUI

struct CoachView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 48))
                    .foregroundColor(.secondary)
                Text("Coach")
                    .font(.headline)
                Text("AI chat interface coming soon.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Coach")
        }
    }
}

#Preview {
    CoachView()
}
