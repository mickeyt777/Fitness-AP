// AppState.swift
// Global app state — is the user signed in, and who are they?
// Injected as an @EnvironmentObject into every view that needs it.

import Combine
import SwiftUI

final class AppState: ObservableObject {
    @Published var userId: String = ""
    @Published var isLoggedIn: Bool = false
    @Published var showingOnboarding: Bool = false

    /// Call this after successful authentication (dev or Apple).
    /// Sets the userId on APIClient so every subsequent request is authenticated.
    func signIn(userId: String) {
        self.userId = userId
        APIClient.shared.devUserId = userId
        self.isLoggedIn = true
    }

    func signOut() {
        self.userId = ""
        APIClient.shared.devUserId = nil
        self.isLoggedIn = false
    }
}
