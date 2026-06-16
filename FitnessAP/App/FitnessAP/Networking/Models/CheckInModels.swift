// CheckInModels.swift
import Foundation

// MARK: - Check-in

struct CheckIn: Decodable, Identifiable {
    let id: String
    let user_id: String
    let date: String           // "YYYY-MM-DD"
    let energy_1_10: Int?
    let nausea_1_10: Int?
    let gi_symptoms_1_10: Int?
    let sleep_hours: Double?
    let notes_text: String?
}

struct DeloadDecision: Decodable {
    let deload: Bool
    let reason: String?
}

struct CheckInResponse: Decodable {
    let checkin: CheckIn
    let deload: DeloadDecision
}

// MARK: - Request bodies (Encodable, used by APIClient)

struct SubmitCheckinBody: Encodable {
    var energy_1_10: Int?
    var nausea_1_10: Int?
    var gi_symptoms_1_10: Int?
    var sleep_hours: Double?
    var notes_text: String?
}
