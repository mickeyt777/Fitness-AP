// RecoveryModels.swift
// Phase 2-D — rest-day / recovery read.
//
// Mirrors GET /recovery/:userId. Non-clinical daily readiness nudge derived from
// recent check-ins (sleep/energy/GLP symptoms) + activity load. `score` is null
// only when `state == "unknown"` (no wellness signal logged yet).

import Foundation

struct RecoveryRead: Decodable {
    let date: String                // "YYYY-MM-DD"
    let state: String               // "ready" | "easy" | "rest" | "unknown"
    let score: Int?                 // 0–100; nil when state == "unknown"
    let label: String
    let headline: String
    let reasons: [String]
}
