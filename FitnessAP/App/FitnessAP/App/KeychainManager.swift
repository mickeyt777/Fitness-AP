// KeychainManager.swift
// Thin wrapper around the iOS Keychain for storing the session token and user ID.
//
// The session token is a backend JWT, valid for 30 days.
// The user ID is the Apple subject claim — stable, never changes for a given user.
// Both are written on sign-in and deleted on sign-out.

import Foundation
import Security

final class KeychainManager {
    static let shared = KeychainManager()
    private init() {}

    private let service = "com.mickey.FitnessAP"

    // MARK: - Named keys

    private enum Key: String {
        case sessionToken = "sessionToken"
        case userId       = "userId"
    }

    // MARK: - Public API

    func setSessionToken(_ token: String) { set(token, for: .sessionToken) }
    func getSessionToken() -> String?     { get(for: .sessionToken) }
    func deleteSessionToken()             { delete(for: .sessionToken) }

    func setUserId(_ id: String)          { set(id, for: .userId) }
    func getUserId() -> String?           { get(for: .userId) }
    func deleteUserId()                   { delete(for: .userId) }

    /// Wipes all stored credentials — call on sign-out.
    func clearAll() {
        delete(for: .sessionToken)
        delete(for: .userId)
    }

    // MARK: - Keychain CRUD

    private func set(_ value: String, for key: Key) {
        guard let data = value.data(using: .utf8) else { return }

        let query: [CFString: Any] = [
            kSecClass:        kSecClassGenericPassword,
            kSecAttrService:  service,
            kSecAttrAccount:  key.rawValue,
        ]

        // Try update first; if the item doesn't exist yet, add it.
        let updateStatus = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var newItem = query
            newItem[kSecValueData] = data
            SecItemAdd(newItem as CFDictionary, nil)
        }
    }

    private func get(for key: Key) -> String? {
        let query: [CFString: Any] = [
            kSecClass:        kSecClassGenericPassword,
            kSecAttrService:  service,
            kSecAttrAccount:  key.rawValue,
            kSecReturnData:   true,
            kSecMatchLimit:   kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data   = result as? Data,
              let string = String(data: data, encoding: .utf8)
        else { return nil }
        return string
    }

    private func delete(for key: Key) {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key.rawValue,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
