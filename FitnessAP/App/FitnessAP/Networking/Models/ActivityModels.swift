// ActivityModels.swift
// Phase 2-C — cardio / steps / HealthKit surfaces.
//
// Mirrors the backend /activity contract (see HANDOFF_phase2C_ios_healthkit.md).
// All distances are METERS and energy is KCAL on the wire (HealthKit-native units);
// display conversion is the app's job via UnitSystem.swift.
//
// NB: HealthModels.swift is the /health ping response — unrelated. Activity types live here.

import Foundation

// MARK: - Cardio session
// One struct covers both shapes the backend returns:
//   • full cardio_sessions row (POST /activity/cardio, GET /activity/:userId/cardio — SELECT *)
//   • the lighter summary projection (GET /activity/:userId/summary → cardio_sessions[])
// Fields absent from the projection (user_id, avg_hr, hk_uuid, superseded_*, notes, created_at)
// are optional so a single Decodable handles both.

struct CardioSession: Decodable, Identifiable {
    let id: String
    let user_id: String?
    let date: String                 // "YYYY-MM-DD"
    let started_at: String?          // ISO-8601 wall-clock start
    let movement_id: String?         // resolved conditioning movement, when matched
    let modality: String?            // fallback label (e.g. "stationary bike")
    let duration_min: Double?
    let distance_m: Double?
    let active_energy_kcal: Double?
    let avg_hr: Int?
    let intensity: String?           // "easy" | "moderate" | "hard"
    let source: String?              // "manual" | "healthkit"
    let hk_uuid: String?
    let superseded_by: String?
    let superseded_at: String?
    let notes: String?
    let created_at: String?
}

// MARK: - Daily activity (full row)
// Returned by POST /activity/daily.

struct DailyActivity: Decodable, Identifiable {
    let id: String
    let user_id: String
    let date: String
    let steps: Int?
    let distance_m: Double?
    let active_energy_kcal: Double?
    let step_goal: Int?              // adaptive snapshot for this day (7-day median +5%)
    let source: String              // "healthkit" | "manual" | "mixed"
    let created_at: String?
    let updated_at: String?
}

// MARK: - Summary payload (GET /activity/:userId/summary)

struct ActivitySummary: Decodable {
    let today: ActivityToday
    let trend: ActivityTrend
    let cardio_minutes_7d: Double
    let daily: [DailyActivityPoint]          // ascending by date
    let cardio_sessions: [CardioSession]
}

struct ActivityToday: Decodable {
    let date: String
    let steps: Int?
    let step_goal: Int?
}

struct ActivityTrend: Decodable {
    let direction: String           // "up" | "flat" | "down"
    let pct: Int?
    let label: String               // non-clinical, e.g. "More active than last week"
}

// The summary's per-day projection (drives Progress sparklines). No id on the wire;
// date is unique per user per day, so it stands in as the identity.
struct DailyActivityPoint: Decodable, Identifiable {
    let date: String
    let steps: Int?
    let distance_m: Double?
    let active_energy_kcal: Double?
    let step_goal: Int?

    var id: String { date }
}

// MARK: - HealthKit sync (POST /activity/healthkit/sync)

/// One workout in a HealthKit sync batch. hk_uuid is required (no UUID → server skips it).
/// Built from an HKWorkout in Slice 2.
struct HealthKitWorkout: Encodable {
    var hk_uuid: String
    var started_at: String?
    var date: String?
    var modality: String?
    var movement_id: String?
    var duration_min: Double?
    var distance_m: Double?
    var active_energy_kcal: Double?
    var avg_hr: Int?
    var intensity: String?
}

struct SyncHealthKitBody: Encodable {
    let workouts: [HealthKitWorkout]
}

struct HealthKitSyncResult: Decodable {
    let inserted: Int
    let updated: Int
    let superseded_manual: Int
    let ids: [String]
}

// MARK: - Request bodies

/// POST /activity/daily — partial-update friendly; omitted fields keep prior values.
struct UpsertDailyActivityBody: Encodable {
    var date: String?
    var steps: Int?
    var distance_m: Double?
    var active_energy_kcal: Double?
    var source: String?
}

/// POST /activity/cardio — log one manual bout.
struct LogCardioSessionBody: Encodable {
    var date: String?
    var started_at: String?
    var modality: String?
    var movement_id: String?
    var duration_min: Double?
    var distance_m: Double?
    var active_energy_kcal: Double?
    var avg_hr: Int?
    var intensity: String?
    var notes: String?
}
