// WorkoutParser.swift
// Hybrid workout-log parser.
//
// Strategy:
//   1. Try Apple Foundation Models (on-device, iOS 26+) — fast, private, free.
//   2. If the model is unavailable, returns low confidence (< 0.70), or throws,
//      fall back to the cloud endpoint which uses Claude Haiku.
//
// Nothing outside this file needs to know which path ran — callers receive
// the same AiParseResponse either way, with `source` set to "on-device" or "cloud".

import Foundation
import FoundationModels

// MARK: - On-device structured output types
// Separate from the network models so @Generable doesn't touch Models.swift.

@Generable
struct OnDeviceWorkoutSet {
    @Guide(description: "Exercise name, capitalised. E.g. 'Goblet Squat', 'Bench Press'.")
    var exercise_name: String

    @Guide(description: "Number of repetitions performed. Omit if not stated.")
    var reps: Int?

    @Guide(description: "Weight in kilograms. Convert lbs → kg (1 lb = 0.4536 kg). Omit if not stated.")
    var weight_kg: Double?

    @Guide(description: "RPE (Rate of Perceived Exertion) on a 1–10 scale. Omit if not stated.")
    var rpe: Double?
}

@Generable
struct OnDeviceWorkoutResult {
    @Guide(description: "'workout_log' when the user describes exercise sets; 'unknown' otherwise.")
    var type: String

    @Guide(description: "One entry per set described. If the user says '3 sets', emit 3 entries.")
    var sets: [OnDeviceWorkoutSet]

    @Guide(description: "Confidence 0.0–1.0 that the structured data is correct.")
    var confidence: Double
}

// MARK: - WorkoutParser

enum WorkoutParser {

    /// Minimum on-device confidence required to skip the cloud call.
    private static let confidenceThreshold: Double = 0.70

    /// Parse rawText. On-device first; cloud if needed.
    static func parse(userId: String, rawText: String) async throws -> AiParseResponse {
        if let result = try? await parseOnDevice(rawText: rawText) {
            let conf = result.parsed.confidence ?? 0
            let sets = result.parsed.sets ?? []
            if result.parsed.type == "workout_log", !sets.isEmpty, conf >= confidenceThreshold {
                print("[WorkoutParser] on-device ✓ confidence=\(conf)")
                return result
            }
            print("[WorkoutParser] on-device low-confidence (\(conf)) or no sets — falling back to cloud")
        } else {
            print("[WorkoutParser] on-device unavailable — using cloud")
        }

        return try await APIClient.shared.aiParse(userId: userId, rawText: rawText)
    }

    // MARK: - On-device path

    private static func parseOnDevice(rawText: String) async throws -> AiParseResponse {
        let model = SystemLanguageModel.default

        guard model.availability == .available else {
            throw WorkoutParserError.modelUnavailable
        }

        let session = LanguageModelSession(model: model)

        let prompt = """
        Parse this fitness log. Extract each set of exercises mentioned.
        If the user says "3 sets", produce 3 set entries.
        Convert any weight in lbs to kg. Log: \(rawText)
        """

        let response = try await session.respond(
            to: prompt,
            generating: OnDeviceWorkoutResult.self
        )

        let r = response.content

        let sets: [ParsedWorkoutSet] = r.sets.map { s in
            ParsedWorkoutSet(
                exercise_name: s.exercise_name,
                reps: s.reps,
                weight_kg: s.weight_kg,
                rpe: s.rpe
            )
        }

        let parsed = ParsedWorkout(
            type: r.type,
            sets: sets.isEmpty ? nil : sets,
            confidence: r.confidence
        )

        return AiParseResponse(parsed: parsed, source: "on-device")
    }
}

// MARK: - Errors

enum WorkoutParserError: Error {
    case modelUnavailable
}
