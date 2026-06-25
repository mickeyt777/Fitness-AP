// RecoveryCard.swift
// Phase 2-D — the Today rest-day / recovery surface.
//
// Self-fetching card (mirrors MacroCard): a state-colored, non-clinical readiness
// nudge wired to GET /recovery/:userId. Informational only — it does not change the
// plan (the acute deload still owns plan scaling). `unknown` shows a gentle
// "log a check-in" prompt; a fetch failure hides the card entirely.

import SwiftUI

struct RecoveryCard: View {
    let userId: String

    /// Bumped by TodayView after a check-in saves; a change re-fetches the read.
    var refreshToken: Int = 0

    @State private var read: RecoveryRead? = nil
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                loadingShell
            } else if let r = read {
                content(r)
            }
            // nil & not loading → fetch failed; show nothing (matches MacroCard).
        }
        .task { await load() }
        .onChange(of: refreshToken) { _, _ in Task { await load() } }
    }

    // MARK: - Content

    private func content(_ r: RecoveryRead) -> some View {
        let p = palette(r.state)
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: p.icon)
                .font(.title2)
                .foregroundColor(p.color)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(r.label)
                        .font(.headline)
                        .foregroundColor(.primary)
                    if let s = r.score {
                        Text("\(s)")
                            .font(.caption).fontWeight(.semibold)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(p.color.opacity(0.15))
                            .foregroundColor(p.color)
                            .clipShape(Capsule())
                    }
                }

                Text(r.headline)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if !r.reasons.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(r.reasons, id: \.self) { reason in
                            HStack(alignment: .top, spacing: 6) {
                                Text("·").foregroundColor(.secondary)
                                Text(reason).font(.caption).foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(.top, 2)
                }
            }

            Spacer(minLength: 0)
        }
        .padding()
        .background(p.color.opacity(0.10))
        .cornerRadius(12)
    }

    /// State → (accent color, SF Symbol). Rest is indigo (calm, non-alarming) to
    /// keep the "recovery, not failure" framing — not red.
    private func palette(_ state: String) -> (color: Color, icon: String) {
        switch state {
        case "ready": return (.green,  "checkmark.circle.fill")
        case "easy":  return (.orange, "figure.walk")
        case "rest":  return (.indigo, "moon.zzz.fill")
        default:      return (.secondary, "square.and.pencil")   // "unknown"
        }
    }

    // MARK: - Loading shell

    private var loadingShell: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color(.tertiarySystemFill))
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.tertiarySystemFill))
                    .frame(width: 120, height: 16)
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.tertiarySystemFill))
                    .frame(maxWidth: .infinity)
                    .frame(height: 14)
            }
            Spacer(minLength: 0)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    // MARK: - Fetch

    private func load() async {
        isLoading = true
        read = try? await APIClient.shared.getRecovery(userId: userId)
        isLoading = false
    }
}

#Preview {
    RecoveryCard(userId: "test-user-001")
        .padding()
}
