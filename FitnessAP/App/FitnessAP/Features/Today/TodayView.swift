// TodayView.swift
// The main daily screen — Tab 1.
// Fetches this week's workout plan from the backend and shows it as expandable session cards.

import SwiftUI

struct TodayView: View {
    @EnvironmentObject var appState: AppState

    @State private var sessions: WorkoutPlan = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading your plan…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = errorMessage {
                    errorView(error)
                } else if sessions.isEmpty {
                    emptyView
                } else {
                    planList
                }
            }
            .navigationTitle("Today")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await loadPlan() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .task { await loadPlan() }
    }

    // MARK: - Sub-views

    private var planList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {

                CheckInCard(userId: appState.userId)
                    .padding(.horizontal)
                    .padding(.top, 4)

                MacroCard(userId: appState.userId)
                    .padding(.horizontal)

                Text("This Week's Plan")
                    .font(.title3).bold()
                    .padding(.horizontal)

                ForEach(sessions) { session in
                    SessionCard(session: session)
                        .padding(.horizontal)
                }
            }
            .padding(.vertical, 4)
        }
        .contentMargins(.bottom, 110, for: .scrollContent)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(.orange)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)
            Button("Try again") {
                Task { await loadPlan() }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "calendar.badge.exclamationmark")
                .font(.largeTitle)
                .foregroundColor(.secondary)
            Text("No workout plan yet")
                .font(.headline)
            Text("Complete your profile so the engine can build your personalised plan.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button("Set up my profile") {
                appState.showingOnboarding = true
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Data loading

    private func loadPlan() async {
        isLoading = true
        errorMessage = nil
        do {
            sessions = try await APIClient.shared.getWorkoutPlan(userId: appState.userId)
        } catch APIError.httpError(let code, _) where code == 404 {
            // No profile yet — show empty state with onboarding CTA, not a red error.
            sessions = []
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Session Card

struct SessionCard: View {
    let session: WorkoutSession
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Header ────────────────────────────────────────────────────
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(session.dayName)
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(session.sessionTitle)
                            .font(.headline)
                            .foregroundColor(.primary)
                    }
                    Spacer()
                    Text("\(session.exercises.count) exercises")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.leading, 4)
                }
                .padding()
            }
            .buttonStyle(.plain)

            // ── Titration warning ─────────────────────────────────────────
            if let note = session.titration_note {
                HStack(spacing: 6) {
                    Image(systemName: "info.circle")
                        .foregroundColor(.orange)
                    Text(note)
                        .font(.caption)
                        .foregroundColor(.orange)
                }
                .padding(.horizontal)
                .padding(.bottom, 10)
            }

            // ── Exercise list (expandable) ────────────────────────────────
            if isExpanded {
                Divider()
                ForEach(Array(session.exercises.enumerated()), id: \.element.id) { index, exercise in
                    ExerciseRow(exercise: exercise)
                    if index < session.exercises.count - 1 {
                        Divider()
                            .padding(.leading, 16)
                    }
                }
            }
        }
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Exercise Row

struct ExerciseRow: View {
    let exercise: Exercise

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(exercise.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Spacer()
                HStack(spacing: 6) {
                    Text("\(exercise.sets)×\(exercise.reps)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    if let rpe = exercise.target_rpe {
                        Text("RPE \(Int(rpe))")
                            .font(.caption)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.12))
                            .foregroundColor(.blue)
                            .cornerRadius(4)
                    }
                }
            }
            if let notes = exercise.notes, !notes.isEmpty {
                Text(notes)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }
}

// MARK: - Preview

#Preview {
    TodayView()
        .environmentObject({
            let s = AppState()
            s.signIn(userId: "test-user-001")
            return s
        }())
}
