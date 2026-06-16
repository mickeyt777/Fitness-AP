// AuthModels.swift
import Foundation

// MARK: - Auth

/// Returned by POST /auth/apple after the backend verifies the Apple identity token.
struct AppleSignInResponse: Decodable {
    let token: String       // 30-day backend session JWT — store in Keychain
    let userId: String      // Apple subject claim — stable user identifier
    let is_new_user: Bool?  // true if this is the user's first sign-in → show onboarding
}
