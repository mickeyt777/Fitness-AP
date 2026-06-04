// Models.swift
// Swift structs that exactly match the JSON the backend returns.
// Field names mirror the database/API — snake_case — so JSONDecoder works without a keyDecodingStrategy.

import Foundation

// MARK: - Health

struct HealthResponse: Decodable {
    let status: String
    let version: String
}

// MARK: - Auth

/// Returned by POST /auth/apple after the backend verifies the Apple identity token.
struct AppleSignInResponse: Decodable {
    let token: String       // 30-day backend session JWT — store in Keychain
    let userId: String      // Apple subject claim — stable user identifier
    let is_new_user: Bool?  // true if this is the user's first sign-in → show onboarding
}

// MARK: - User

struct UserModel: Decodable {
    let id: String
    let display_name: String?
    let created_at: String?
}

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

// MARK: - Workout Plan
//
// GET /workouts/:userId/plan returns a JSON array of sessions directly.
// typealias keeps call sites readable: `let plan: WorkoutPlan`

typealias WorkoutPlan = [WorkoutSession]

struct WorkoutSession: Decodable, Identifiable {
    let id: String
    let day_offset: Int        // days from today (0 = today)
    let day_of_week: Int       // 0 = Sunday … 6 = Saturday
    let session_type: String   // "full_body_a", "upper", "deload", etc.
    let exercises: [Exercise]
    let titration_note: String?

    // Convenience helpers used in the UI
    var dayName: String {
        let names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        guard (0..<7).contains(day_of_week) else { return "—" }
        return names[day_of_week]
    }

    var sessionTitle: String {
        switch session_type {
        case "full_body_a": return "Full Body A"
        case "full_body_b": return "Full Body B"
        case "full_body_c": return "Full Body C"
        case "upper":       return "Upper Body"
        case "lower":       return "Lower Body"
        case "deload":      return "Deload"
        case "mobility":    return "Mobility"
        default:            return session_type.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

struct Exercise: Decodable, Identifiable {
    let id: String
    let exercise_id: String
    let name: String
    let sets: Int
    let reps: String        // e.g. "10–12" or "60 sec/side"
    let target_rpe: Double?
    let notes: String?
}

// MARK: - Macros

struct MacroResult: Decodable {
    let protein_g: Int
    let fat_g: Int
    let carbs_g: Int
    let calories_floor: Int
    let goal_lbm_kg: Double?
    let goal_lbm_lbs: Double?
    let body_fat_pct: Double?
    let notes: [String]?
}

// MARK: - Food leaderboard

struct FoodItem: Decodable, Identifiable {
    var id: String { food }
    let food: String
    let protein_g_per_100_kcal: Double
    let notes: String?
}

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

struct SubmitCheckinBody: Encodable {
    var energy_1_10: Int?
    var nausea_1_10: Int?
    var gi_symptoms_1_10: Int?
    var sleep_hours: Double?
    var notes_text: String?
}

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

// MARK: - AI parse

struct ParsedWorkoutSet: Codable {
    var exercise_name: String
    var reps: Int?
    var weight_kg: Double?
    var rpe: Double?
}

struct ParsedWorkout: Codable {
    let type: String            // "workout_log" | "nutrition_log" | "side_effect" | "unknown"
    let sets: [ParsedWorkoutSet]?
    let confidence: Double?
}

struct AiParseResponse: Decodable {
    let parsed: ParsedWorkout
    let source: String
}

// MARK: - Send chat body

struct SendChatBody: Encodable {
    let raw_text: String
    let parsed_payload: ParsedWorkout?
    let parser_source: String?
    let parser_confidence: Double?
}

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
