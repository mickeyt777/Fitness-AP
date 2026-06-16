// ProfileModels.swift
import Foundation

// MARK: - Profile

struct Profile: Decodable {
    let user_id: String
    let age: Int?
    let sex: String?
    let height_cm: Double?
    let current_weight_kg: Double?
    let starting_weight_kg: Double?
    let goal_body_fat_pct: Double?
    let training_history_level: String?
    let days_per_week: Int?
    let equipment_available: [String]?
    let glp_drug: String?
    let glp_current_dose_mg: String?   // stored as TEXT in DB, returned as string after decrypt
    let glp_injection_day_of_week: Int?
    let glp_start_date: String?
    let last_dose_change_date: String?
    let unit_system: String?        // "metric" | "imperial" — display preference only
    let updated_at: String?
}

struct UpsertProfileBody: Encodable {
    var age: Int?
    var sex: String?
    var height_cm: Double?
    var current_weight_kg: Double?
    var starting_weight_kg: Double?
    var goal_body_fat_pct: Double?
    var training_history_level: String?
    var days_per_week: Int?
    var equipment_available: [String]?
    var glp_drug: String?
    var glp_current_dose_mg: String?   // sent as string to match TEXT storage in DB
    var glp_injection_day_of_week: Int?
    var glp_start_date: String?
    var last_dose_change_date: String?
    var unit_system: String?        // "metric" | "imperial"
}
