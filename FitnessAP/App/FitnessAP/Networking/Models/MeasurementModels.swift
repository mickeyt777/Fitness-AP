// MeasurementModels.swift
import Foundation

// MARK: - Measurements
// Named BodyMeasurement to avoid conflicting with Foundation's Measurement<UnitType>.

struct BodyMeasurement: Decodable, Identifiable {
    let id: String
    let user_id: String
    let taken_at: String        // "YYYY-MM-DD"
    let weight_kg: Double?
    let waist_cm: Double?
    let hip_cm: Double?
    let chest_cm: Double?
    let arm_cm: Double?
    let thigh_cm: Double?
    let progress_photo_front_url: String?
    let progress_photo_side_url: String?
    let created_at: String?
}

struct LeanMassProxy: Decodable {
    let score: String?          // "green" | "yellow" | "hold" | "flag" | nil
    let summary: String
    let waist_change_cm: Double?
    let arm_change_cm: Double?
    let thigh_change_cm: Double?
}

struct MeasurementResponse: Decodable {
    let measurement: BodyMeasurement
    let lean_mass_proxy: LeanMassProxy
}

struct LogMeasurementBody: Encodable {
    var taken_at: String?
    var weight_kg: Double?
    var waist_cm: Double?
    var hip_cm: Double?
    var chest_cm: Double?
    var arm_cm: Double?
    var thigh_cm: Double?
}
