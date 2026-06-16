// ChatModels.swift
import Foundation

// MARK: - Chat

struct ChatMessage: Decodable, Identifiable {
    let id: String
    let user_id: String
    let sent_at: String
    let role: String            // "user" | "assistant"
    let raw_text: String
    let parsed_payload: String? // JSON string stored by backend
    let parser_source: String?
    let parser_confidence: Double?
}

struct ChatResponse: Decodable {
    let message: ChatMessage
    let action: ChatAction?
}

struct ChatAction: Decodable {
    let type: String
    let workout_id: String?
    let sets_logged: Int?
    let note: String?
}

// MARK: - Send chat body

struct SendChatBody: Encodable {
    let raw_text: String
    let parsed_payload: ParsedWorkout?
    let parser_source: String?
    let parser_confidence: Double?
}
