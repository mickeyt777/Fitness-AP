// WorkoutModels.swift
import Foundation

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
