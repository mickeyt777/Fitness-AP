// SignInView.swift
// Shown in release builds when no Keychain session exists.
// Presents the Sign in with Apple button, handles the credential flow,
// and calls POST /auth/apple to exchange Apple's token for a 30-day backend JWT.
//
// REQUIREMENT: The Xcode target must have the "Sign in with Apple" capability
// enabled under Signing & Capabilities.

import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @EnvironmentObject var appState: AppState

    @State private var isLoading    = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // ── Branding ──────────────────────────────────────────────────
            VStack(spacing: 12) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.system(size: 72))
                    .foregroundColor(.blue)

                Text("Fitness AP")
                    .font(.largeTitle).bold()

                Text("Your GLP-1 training companion")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // ── Error ─────────────────────────────────────────────────────
            if let msg = errorMessage {
                Text(msg)
                    .font(.caption)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                    .padding(.bottom, 16)
            }

            // ── Sign-in button ────────────────────────────────────────────
            Group {
                if isLoading {
                    ProgressView("Signing in…")
                        .frame(height: 50)
                } else {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        Task { await handleCompletion(result) }
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 50)
                    .cornerRadius(8)
                }
            }
            .padding(.horizontal, 40)

            // ── Fine print ────────────────────────────────────────────────
            Text("Your data is stored privately and never sold.")
                .font(.caption2)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
                .padding(.top, 16)
                .padding(.bottom, 48)
        }
    }

    // MARK: - Handle Apple auth result

    private func handleCompletion(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let error):
            // User cancelled — don't show an error for that.
            if (error as? ASAuthorizationError)?.code != .canceled {
                errorMessage = error.localizedDescription
            }
            return

        case .success(let auth):
            guard
                let credential    = auth.credential as? ASAuthorizationAppleIDCredential,
                let tokenData     = credential.identityToken,
                let identityToken = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = "Could not read credentials from Apple. Please try again."
                return
            }

            // Apple only provides name on the very first sign-in.
            let displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")

            isLoading     = true
            errorMessage  = nil

            do {
                let response = try await APIClient.shared.appleSignIn(
                    identityToken: identityToken,
                    displayName:   displayName.isEmpty ? nil : displayName
                )

                // Store credentials and sign in.
                appState.signIn(userId: response.userId, sessionToken: response.token)

                // First-time users go straight to onboarding.
                if response.is_new_user == true {
                    appState.showingOnboarding = true
                }

            } catch {
                errorMessage = "Sign in failed: \(error.localizedDescription)"
            }

            isLoading = false
        }
    }
}

#Preview {
    SignInView()
        .environmentObject(AppState())
}
