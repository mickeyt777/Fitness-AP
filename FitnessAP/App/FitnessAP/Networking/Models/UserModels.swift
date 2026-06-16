// UserModels.swift
import Foundation

// MARK: - User

struct UserModel: Decodable {
    let id: String
    let display_name: String?
    let created_at: String?
}
