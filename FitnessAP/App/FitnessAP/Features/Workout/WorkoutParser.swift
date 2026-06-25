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
struct OnDeviceCardio {
    @Guide(description: "The cardio activity as spoken, e.g. 'stationary bike', 'outdoor run', 'rowing'.")
    var modality: String

    @Guide(description: "Duration of the bout in minutes. Omit if not stated.")
    var duration_min: Double?

    @Guide(description: "Intensity: exactly one of 'easy', 'moderate', or 'hard' (lowercase). Omit if not stated.")
    var intensity: String?

    @Guide(description: "Distance in metres. Convert km/miles (1 km = 1000 m, 1 mile = 1609.34 m). Omit if not stated.")
    var distance_m: Double?
}

@Generable
struct OnDeviceWorkoutResult {
    @Guide(description: "'workout_log' for resistance sets (reps/weight); 'cardio_log' for a continuous endurance bout (run/bike/row/walk/swim described by duration or distance); 'unknown' otherwise.")
    var type: String

    @Guide(description: "One entry per resistance set described. If the user says '3 sets', emit 3 entries. Empty for cardio_log or unknown.")
    var sets: [OnDeviceWorkoutSet]

    @Guide(description: "The cardio bout when type is 'cardio_log'. Omit otherwise.")
    var cardio: OnDeviceCardio?

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
            let type = result.parsed.type
            let sets = result.parsed.sets ?? []
            // A usable workout needs at least one set; a usable cardio bout needs a
            // modality and a duration. Anything else falls through to the cloud.
            let okWorkout = type == "workout_log" && !sets.isEmpty
            let okCardio  = type == "cardio_log"
                && !(result.parsed.cardio?.modality.isEmpty ?? true)
                && result.parsed.cardio?.duration_min != nil
            if (okWorkout || okCardio), conf >= confidenceThreshold {
                print("[WorkoutParser] on-device ✓ type=\(type) confidence=\(conf)")
                return result
            }
            print("[WorkoutParser] on-device low-confidence (\(conf)) or unusable — falling back to cloud")
        } else {
            print("[WorkoutParser] on-device unavailable — using cloud")
        }

        return try await APIClient.shared.aiParse(userId: userId, rawText: rawText)
    }

    // MARK: - Alias resolution (P1-D)

    /// Resolve each set's `exercise_name` to a canonical movement id/name via
    /// GET /movements/search. Kept as an explicit step (separate from parse) so
    /// the on-device parse path stays fully offline until the caller asks for
    /// resolution. Best-effort: a set whose name doesn't confidently match (or
    /// whose lookup fails) is returned with `movement_id` left nil rather than
    /// failing the whole batch. Input order is preserved. Lookups run
    /// concurrently.
    static func resolve(userId: String, sets: [ParsedWorkoutSet]) async -> [ParsedWorkoutSet] {
        guard !sets.isEmpty else { return sets }

        return await withTaskGroup(of: (Int, ParsedWorkoutSet).self) { group in
            for (index, set) in sets.enumerated() {
                group.addTask {
                    var resolved = set
                    if let result = try? await APIClient.shared.searchMovement(
                        userId: userId, query: set.exercise_name
                    ), let match = result.match {
                        resolved.movement_id = match.id
                        resolved.canonical_name = match.name
                    }
                    return (index, resolved)
                }
            }

            var out = Array(sets)
            for await (index, resolved) in group {
                out[index] = resolved
            }
            return out
        }
    }

    /// Convenience: resolve the sets inside a parse response, returning a new
    /// response with resolved sets. Leaves `parsed` untouched when there are none.
    static func resolve(userId: String, response: AiParseResponse) async -> AiParseResponse {
        guard let sets = response.parsed.sets, !sets.isEmpty else { return response }
        let resolvedSets = await resolve(userId: userId, sets: sets)
        let parsed = ParsedWorkout(
            type: response.parsed.type,
            sets: resolvedSets,
            cardio: response.parsed.cardio,
            confidence: response.parsed.confidence
        )
        return AiParseResponse(parsed: parsed, source: response.source)
    }

    // MARK: - On-device path

    private static func parseOnDevice(rawText: String) async throws -> AiParseResponse {
        let model = SystemLanguageModel.default

        guard model.availability == .available else {
            throw WorkoutParserError.modelUnavailable
        }

        let session = LanguageModelSession(model: model)

        let prompt = """
        Parse this fitness log.
        - If it describes resistance sets (reps/weight), set type "workout_log" and
          extract each set. If the user says "3 sets", produce 3 set entries.
          Convert any weight in lbs to kg.
        - If it describes a continuous cardio bout (running, walking, cycling,
          rowing, swimming, etc., characterised by a duration or distance), set
          type "cardio_log" and fill `cardio` (modality, duration in minutes,
          intensity as easy/moderate/hard, distance in metres).
        Log: \(rawText)
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

        // Normalise intensity to the backend's allowed lowercase set
        // ('easy'/'moderate'/'hard'); anything else becomes nil so the
        // cardio_sessions CHECK constraint never rejects an on-device parse.
        let cardio: ParsedCardio? = r.cardio.map { c in
            let norm = c.intensity?.lowercased()
            let intensity = ["easy", "moderate", "hard"].contains(norm) ? norm : nil
            return ParsedCardio(
                modality: c.modality,
                duration_min: c.duration_min,
                intensity: intensity,
                distance_m: c.distance_m
            )
        }

        let parsed = ParsedWorkout(
            type: r.type,
            sets: sets.isEmpty ? nil : sets,
            cardio: cardio,
            confidence: r.confidence
        )

        // "on_device" (underscore) to match the chat_messages.parser_source CHECK
        // (migration 007: IN 'on_device','cloud','none'). A hyphen here makes the
        // server INSERT fail the CHECK and the log silently 500s.
        return AiParseResponse(parsed: parsed, source: "on_device")
    }
}

// MARK: - Errors

enum WorkoutParserError: Error {
    case modelUnavailable
}
