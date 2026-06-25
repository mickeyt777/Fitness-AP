// WeeklyReportModels.swift
// Phase 2-C/D follow-on — the weekly-report surface.
//
// Mirrors engine/weeklyReport.js → aggregateWeeklyReport() (served by
// GET /reports/:userId/weekly) and the LLM narrative from POST /ai/weekly-report.
//
// WeeklySummary is Codable (not just Decodable): the same object the GET returns
// is sent straight back as `summary_data` to POST /ai/weekly-report, which
// JSON.stringifies it into the narrative prompt. Field names therefore round-trip
// 1:1 with the backend keys — do not rename without updating weeklyReport.js.
//
// Units are wire-native (kg, cm, kcal, counts); display conversion is the app's job.

import Foundation

// MARK: - Top-level summary (GET /reports/:userId/weekly)

struct WeeklySummary: Codable {
    let period: WeeklyPeriod
    let workouts: WeeklyWorkouts
    let strength: [WeeklyStrength]
    let checkins: WeeklyCheckins
    let measurements: WeeklyMeasurements
    let activity: WeeklyActivity
    let body_weight: WeeklyBodyWeight
    let drug_context: WeeklyDrugContext
    let lean_mass_proxy: WeeklyLeanMassProxy  // headline; duplicates measurements.proxy
}

struct WeeklyPeriod: Codable {
    let start: String   // "YYYY-MM-DD"
    let end: String
}

struct WeeklyWorkouts: Codable {
    let planned: Int
    let completed: Int
    let adherence_pct: Int?            // null when nothing was planned
    let total_tonnage_kg: Int
    let avg_rpe: Double?               // null when no RPE logged
}

// One row per top-trained exercise (max 2). this_week/last_week/change are null
// when the data isn't there to compute them.
struct WeeklyStrength: Codable, Identifiable {
    let exercise_id: String
    let exercise_name: String
    let this_week_kg: Double?
    let last_week_kg: Double?
    let change_kg: Double?

    var id: String { exercise_id }
}

struct WeeklyCheckins: Codable {
    let days_logged: Int
    let avg_energy: Double?
    let avg_nausea_inv: Double?        // higher = better (10 = no nausea)
    let avg_gi_inv: Double?
    let avg_sleep_hrs: Double?
    let symptom_days: Int
}

// buildMeasurementSummary returns three shapes; the optionals cover all of them:
//   • no data:    { available:false, proxy }                       (current/previous/changes absent)
//   • first only: { available:true, current, previous:null, changes:null, proxy }
//   • full:       { available:true, current, previous, changes, proxy }
struct WeeklyMeasurements: Codable {
    let available: Bool
    let current: MeasurementSnapshot?
    let previous: MeasurementSnapshot?
    let changes: MeasurementChanges?
    let proxy: WeeklyLeanMassProxy
}

struct MeasurementSnapshot: Codable {
    let weight_kg: Double?
    let waist_cm: Double?
    let hip_cm: Double?
    let chest_cm: Double?
    let arm_cm: Double?
    let thigh_cm: Double?
}

// NB: the backend's `changes` block intentionally omits chest_cm (it isn't part of
// the lean-mass proxy), so there is no chest_cm here.
struct MeasurementChanges: Codable {
    let weight_kg: Double?
    let waist_cm: Double?
    let hip_cm: Double?
    let arm_cm: Double?
    let thigh_cm: Double?
}

// score is one of: "green" | "yellow" | "hold" | "flag", or null when there's no
// measurement to score. summary is always present.
//
// Named WeeklyLeanMassProxy to avoid colliding with MeasurementModels.LeanMassProxy
// (a Decodable-only type with extra *_change_cm fields). This one is Codable so the
// whole WeeklySummary can be re-encoded as summary_data for the narrative call.
struct WeeklyLeanMassProxy: Codable {
    let score: String?
    let summary: String
}

struct WeeklyActivity: Codable {
    let days_logged: Int
    let avg_steps: Int?
    let step_goal_hit_days: Int
    let total_distance_km: Double
    let total_active_energy_kcal: Int
    let cardio_sessions: Int
    let cardio_minutes: Int
    let cardio_by_intensity: CardioByIntensity
}

struct CardioByIntensity: Codable {
    let easy: Int
    let moderate: Int
    let hard: Int
}

struct WeeklyBodyWeight: Codable {
    let this_week_kg: Double?
    let trend_4wk_kg: Double?
}

struct WeeklyDrugContext: Codable {
    let in_titration_window: Bool
    let current_drug: String?
    let days_since_dose_change: Int?
}

// MARK: - Narrative (POST /ai/weekly-report)

/// The LLM-written summary. `narrative` is a "[STUB …]" string when the backend
/// has no CLOUD_LLM_PROVIDER configured — the view renders it verbatim either way.
struct WeeklyNarrativeResponse: Decodable {
    let narrative: String
    let source: String          // "cloud"
}
