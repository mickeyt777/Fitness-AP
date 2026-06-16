// AIParseModels.swift
import Foundation

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
