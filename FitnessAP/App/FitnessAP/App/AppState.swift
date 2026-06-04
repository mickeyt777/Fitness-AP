// AppState.swift
// Global app state — is the user signed in, and who are they?
// Injected as an @EnvironmentObject into every view that needs it.

import Combine
import SwiftUI

final class AppState: ObservableObject {
    @Published var userId: String = ""
    @Published var isLoggedIn: Bool = false
    @Published var showingOnboarding: Bool = false

    /// Active unit system — loaded from the user's profile on launch.
    /// Defaults to metric until the profile is fetched.
    @Published var unitSystem: UnitSystem = .metric

    // MARK: - Init — restore session from Keychain on launch

    init() {
        guard
            let userId = KeychainManager.shared.getUserId(),
            let token  = KeychainManager.shared.getSessionToken(),
            !userId.isEmpty, !token.isEmpty
        else { return }

        self.userId    = userId
        self.isLoggedIn = true
        APIClient.shared.sessionToken = token
    }

    // MARK: - Sign in

    /// Production sign-in (Sign in with Apple).
    /// Stores the session token in the Keychain and wires it to APIClient.
    func signIn(userId: String, sessionToken: String) {
        self.userId = userId
        APIClient.shared.sessionToken = sessionToken
        APIClient.shared.devUserId    = nil
        KeychainManager.shared.setUserId(userId)
        KeychainManager.shared.setSessionToken(sessionToken)
        self.isLoggedIn = true
    }

    /// Dev-mode sign-in (DevLoginView, debug builds only).
    /// Uses the X-User-Id header — no Keychain storage.
    func signIn(userId: String) {
        self.userId = userId
        APIClient.shared.devUserId    = userId
        APIClient.shared.sessionToken = nil
        self.isLoggedIn = true
    }

    // MARK: - Sign out

    func signOut() {
        self.userId     = ""
        self.isLoggedIn = false
        self.unitSystem = .metric
        APIClient.shared.sessionToken = nil
        APIClient.shared.devUserId    = nil
        KeychainManager.shared.clearAll()
    }

    // MARK: - Unit system

    /// Fetch the user's profile and sync unitSystem from it.
    /// Called once from ContentView's .task after sign-in.
    /// Silently no-ops if no profile exists yet (new user in onboarding).
    func loadUnitSystem() async {
        guard !userId.isEmpty else { return }
        if let profile = try? await APIClient.shared.getProfile(userId: userId),
           let raw = profile.unit_system,
           let us  = UnitSystem(rawValue: raw) {
            await MainActor.run { unitSystem = us }
        }
    }
}
