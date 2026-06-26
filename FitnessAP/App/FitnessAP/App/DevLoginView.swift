// DevLoginView.swift
// Shown when the user isn't signed in — dev-mode only.
// In production this will be replaced by a real Sign in with Apple button.

import SwiftUI

struct DevLoginView: View {
    @EnvironmentObject var appState: AppState

    @State private var userId = "test-user-001"
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            Image(systemName: "figure.strengthtraining.traditional")
                .font(.system(size: 64))
                .foregroundColor(.blue)

            VStack(spacing: 6) {
                Text("Fitness GLP")
                    .font(.largeTitle).bold()

                Text("DEV MODE")
                    .font(.caption).bold()
                    .foregroundColor(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.orange.opacity(0.15))
                    .cornerRadius(5)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Test user ID")
                    .font(.caption)
                    .foregroundColor(.secondary)
                TextField("test-user-001", text: $userId)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }
            .padding(.horizontal, 40)

            if let msg = errorMessage {
                Text(msg)
                    .font(.caption)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Button {
                Task { await signIn() }
            } label: {
                Group {
                    if isLoading {
                        ProgressView()
                    } else {
                        Text("Sign in (Dev)")
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 40)
            .disabled(userId.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)

            Spacer()

            Text("Sign in with Apple will replace this screen in production.")
                .font(.caption2)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.bottom, 16)
        }
    }

    private func signIn() async {
        isLoading = true
        errorMessage = nil

        let trimmed = userId.trimmingCharacters(in: .whitespaces)

        do {
            // Try to create the user. The backend returns 409 if they already exist.
            _ = try await APIClient.shared.createUser(id: trimmed, displayName: "Test User")
        } catch APIError.httpError(let code, _) where code == 409 {
            // User already exists — fine, fall through
        } catch {
            // Any other error (network down, etc.) — show it but still attempt sign-in
            // so an existing user can log in even if creation fails.
            errorMessage = "Note: \(error.localizedDescription)"
        }

        // Whether or not creation succeeded, set the userId so API calls work.
        appState.signIn(userId: trimmed)
        isLoading = false
    }
}

#Preview {
    DevLoginView()
        .environmentObject(AppState())
}
