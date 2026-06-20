// AIParseModels.swift
import Foundation

// MARK: - AI parse

struct ParsedWorkoutSet: Codable {
    var exercise_name: String
    var reps: Int?
    var weight_kg: Double?
    var rpe: Double?

    // Filled by WorkoutParser.resolve(sets:) (P1-D). The LLM parse step leaves
    // these nil; resolution maps `exercise_name` to a canonical movement via
    // GET /movements/search. `movement_id` is nil when no confident match.
    var movement_id: String? = nil
    var canonical_name: String? = nil
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

// MARK: - Movement alias resolution (P1-D)
// Response of GET /movements/search?q=. `match` is the single best hit (nil when
// nothing matched); `candidates` is the ranked list (best first) for cases where
// a term is ambiguous (e.g. "rdl" → Barbell RDL vs Dumbbell RDL) and the UI may
// want to let the user pick. We only decode id + name; the backend's `match`
// carries more fields, which Decodable safely ignores.
struct MovementRef: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
}

struct MovementSearchResult: Decodable {
    let query: String
    let match: MovementRef?
    let candidates: [MovementRef]
}
