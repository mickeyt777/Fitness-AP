// ActivityCard.swift
// Phase 2-C — the Today steps/cardio surface.
//
// Self-fetching card (mirrors MacroCard): shows today's steps against the adaptive
// step goal as a ring, weekly cardio minutes, and the non-clinical activity trend.
// Wired to GET /activity/:userId/summary. If Health is connected it best-effort
// syncs first so the ring reflects fresh data. Hides quietly if the fetch fails.

import SwiftUI

struct ActivityCard: View {
    let userId: String
    // Bumped by TodayView's pull-to-refresh to force a fresh HealthKit sync,
    // bypassing the throttle. Defaults to 0 so other call sites/previews compile.
    var refreshToken: Int = 0

    @State private var summary: ActivitySummary? = nil
    @State private var isLoading = true

    /// Don't re-pull ~30 days of HealthKit workouts on every Today appearance.
    /// Throttle auto-syncs to once per interval; pull-to-refresh forces one.
    private static let syncInterval: TimeInterval = 15 * 60
    private static var lastSyncByUser: [String: Date] = [:]

    var body: some View {
        Group {
            if isLoading {
                loadingShell
            } else if let s = summary {
                content(s)
            }
            // nil & not loading → fetch failed; show nothing (matches MacroCard).
        }
        .task { await load(force: false) }
        .onChange(of: refreshToken) { _, _ in
            Task { await load(force: true) }
        }
    }

    // MARK: - Content

    private func content(_ s: ActivitySummary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Activity", systemImage: "figure.walk.motion")
                .font(.headline)

            HStack(spacing: 16) {
                StepRing(steps: s.today.steps, goal: s.today.step_goal)
                    .frame(width: 92, height: 92)

                VStack(alignment: .leading, spacing: 12) {
                    metric(value: "\(Int(s.cardio_minutes_7d.rounded())) min",
                           label: "Cardio this week",
                           systemImage: "heart.fill",
                           color: .pink)
                    trendRow(s.trend)
                }
                Spacer(minLength: 0)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func metric(value: String, label: String, systemImage: String, color: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .foregroundColor(color)
            VStack(alignment: .leading, spacing: 0) {
                Text(value).font(.headline)
                Text(label).font(.caption).foregroundColor(.secondary)
            }
        }
    }

    private func trendRow(_ t: ActivityTrend) -> some View {
        HStack(spacing: 8) {
            Image(systemName: trendIcon(t.direction))
                .foregroundColor(trendColor(t.direction))
            Text(t.label)
                .font(.subheadline)
                .foregroundColor(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func trendIcon(_ direction: String) -> String {
        switch direction {
        case "up":   return "arrow.up.right"
        case "down": return "arrow.down.right"
        default:     return "arrow.right"
        }
    }

    private func trendColor(_ direction: String) -> Color {
        switch direction {
        case "up":   return .green
        case "down": return .orange
        default:     return .secondary
        }
    }

    // MARK: - Loading shell (keeps layout stable while fetching)

    private var loadingShell: some View {
        HStack(spacing: 16) {
            Circle()
                .fill(Color(.tertiarySystemFill))
                .frame(width: 92, height: 92)
            VStack(alignment: .leading, spacing: 10) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.tertiarySystemFill))
                    .frame(width: 140, height: 18)
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.tertiarySystemFill))
                    .frame(width: 180, height: 16)
            }
            Spacer(minLength: 0)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    // MARK: - Fetch

    private func load(force: Bool) async {
        // Only show the skeleton on the first load; a throttled/forced refresh
        // shouldn't flash it over already-visible data.
        if summary == nil { isLoading = true }

        // If the user connected Health this session, sync first so the ring is fresh.
        // Best-effort — a sync failure must not block showing whatever the API has.
        // Throttled: skip the (~30-day) re-pull unless forced or the interval elapsed.
        if HealthKitManager.shared.isHealthDataAvailable,
           HealthKitManager.shared.authorizationRequested,
           shouldSync(force: force) {
            try? await HealthKitManager.shared.performInitialSync(userId: userId)
            Self.lastSyncByUser[userId] = Date()
        }
        summary = try? await APIClient.shared.getActivitySummary(userId: userId)
        isLoading = false
    }

    private func shouldSync(force: Bool) -> Bool {
        if force { return true }
        guard let last = Self.lastSyncByUser[userId] else { return true }
        return Date().timeIntervalSince(last) >= Self.syncInterval
    }
}

// MARK: - Step ring

private struct StepRing: View {
    let steps: Int?
    let goal: Int?

    /// Fraction of the goal achieved, capped at 1. Nil when the goal isn't set yet
    /// (the adaptive goal needs ≥3 baseline days), so we show a flat track instead.
    private var progress: Double? {
        guard let steps, let goal, goal > 0 else { return nil }
        return min(Double(steps) / Double(goal), 1.0)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(.tertiarySystemFill), lineWidth: 10)
            if let p = progress {
                Circle()
                    .trim(from: 0, to: p)
                    .stroke(Color.green, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            VStack(spacing: 1) {
                Text(stepsText)
                    .font(.headline)
                    .foregroundColor(.primary)
                Text(goalText)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }

    private var stepsText: String {
        guard let steps else { return "—" }
        return steps >= 1000 ? String(format: "%.1fk", Double(steps) / 1000) : "\(steps)"
    }

    private var goalText: String {
        guard let goal else { return "steps" }
        return "of " + (goal >= 1000 ? String(format: "%.0fk", Double(goal) / 1000) : "\(goal)")
    }
}

#Preview {
    ActivityCard(userId: "test-user-001")
        .padding()
}
