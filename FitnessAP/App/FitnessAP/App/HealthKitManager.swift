// HealthKitManager.swift
// Phase 2-C — HealthKit read layer.
//
// Reads steps / walking+running distance / active energy (today's rollup) and recent
// HKWorkouts, mapping each workout to the backend's /activity/healthkit/sync payload
// (HealthKitWorkout) using HKWorkout.uuid as the idempotency key (hk_uuid).
//
// READ-ONLY: we never write to HealthKit (toShare is empty). Manual entry in the app
// is always available regardless of whether the user grants Health access.
//
// Xcode prerequisites (cannot be set from source — Mickey adds these once, like
// Sign in with Apple before it):
//   • Target → Signing & Capabilities → + Capability → HealthKit.
//   • Info.plist → NSHealthShareUsageDescription (read-access purpose string).
// Without both, requestAuthorization() throws at runtime.

import Combine
import Foundation
import HealthKit

@MainActor
final class HealthKitManager: ObservableObject {
    static let shared = HealthKitManager()

    enum HealthKitError: LocalizedError {
        case notAvailable
        var errorDescription: String? {
            switch self {
            case .notAvailable: return "Health data isn't available on this device."
            }
        }
    }

    /// Today's read-only rollup, in HealthKit-native units (meters / kcal).
    struct TodayActivity {
        var steps: Int?
        var distanceM: Double?
        var activeEnergyKcal: Double?
    }

    private let store = HKHealthStore()

    /// True once the system authorization sheet has been presented and dismissed.
    /// Note: Apple intentionally reports read authorization as `.notDetermined` even
    /// after a grant (privacy), so this only means "we asked" — not "access granted".
    @Published private(set) var authorizationRequested = false

    var isHealthDataAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    // Read set: steps, walking+running distance, active energy, heart rate, workouts.
    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        for id in [HKQuantityTypeIdentifier.stepCount,
                   .distanceWalkingRunning,
                   .activeEnergyBurned,
                   .heartRate] {
            if let t = HKQuantityType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        return types
    }

    private init() {}

    // MARK: - Authorization

    /// Presents the Health read-access sheet. Resolves once the user responds (grant
    /// or deny). Throws `.notAvailable` on devices without Health (e.g. iPad).
    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw HealthKitError.notAvailable }
        try await store.requestAuthorization(toShare: [], read: readTypes)
        authorizationRequested = true
    }

    // MARK: - Reads

    /// Today's step / distance / active-energy totals (midnight → now, local time).
    func fetchTodayActivity(for date: Date = Date()) async throws -> TodayActivity {
        let start = Calendar.current.startOfDay(for: date)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: date, options: .strictStartDate)

        async let steps  = sumQuantity(.stepCount, unit: .count(), predicate: predicate)
        async let dist   = sumQuantity(.distanceWalkingRunning, unit: .meter(), predicate: predicate)
        async let energy = sumQuantity(.activeEnergyBurned, unit: .kilocalorie(), predicate: predicate)

        let (s, d, e) = try await (steps, dist, energy)
        return TodayActivity(
            steps: s.map { Int($0.rounded()) },
            distanceM: d,
            activeEnergyKcal: e
        )
    }

    /// Recent workouts mapped to the backend sync payload, newest first.
    func fetchRecentWorkouts(days: Int = 30) async throws -> [HealthKitWorkout] {
        let start = Calendar.current.date(byAdding: .day, value: -days,
                                          to: Calendar.current.startOfDay(for: Date())) ?? Date()
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(sampleType: .workoutType(), predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
                if let error { cont.resume(throwing: error); return }
                cont.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(q)
        }

        var out: [HealthKitWorkout] = []
        for w in workouts {
            let avgHR = try? await averageHeartRate(start: w.startDate, end: w.endDate)
            out.append(Self.mapWorkout(w, avgHR: avgHR))
        }
        return out
    }

    // MARK: - Sync helper (reused by the Today surface in Slice 3)

    /// Pushes today's rollup and recent workouts to the backend. Idempotent server-side
    /// (daily upsert by date; workouts deduped by hk_uuid). Returns the workout sync result.
    @discardableResult
    func performInitialSync(userId: String, days: Int = 30) async throws -> HealthKitSyncResult {
        let today = try await fetchTodayActivity()
        _ = try await APIClient.shared.upsertDailyActivity(
            userId: userId,
            body: UpsertDailyActivityBody(
                date: nil,
                steps: today.steps,
                distance_m: today.distanceM,
                active_energy_kcal: today.activeEnergyKcal,
                source: "healthkit"
            )
        )
        let workouts = try await fetchRecentWorkouts(days: days)
        return try await APIClient.shared.syncHealthKitWorkouts(userId: userId, workouts: workouts)
    }

    // MARK: - Private query helpers

    private func sumQuantity(_ id: HKQuantityTypeIdentifier, unit: HKUnit,
                             predicate: NSPredicate) async throws -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return nil }
        return try await withCheckedThrowingContinuation { cont in
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate,
                                      options: .cumulativeSum) { _, stats, error in
                if let error { cont.resume(throwing: error); return }
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    private func averageHeartRate(start: Date, end: Date) async throws -> Double? {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        return try await withCheckedThrowingContinuation { cont in
            let q = HKStatisticsQuery(quantityType: hrType, quantitySamplePredicate: predicate,
                                      options: .discreteAverage) { _, stats, error in
                if let error { cont.resume(throwing: error); return }
                let bpm = HKUnit.count().unitDivided(by: .minute())
                cont.resume(returning: stats?.averageQuantity()?.doubleValue(for: bpm))
            }
            store.execute(q)
        }
    }

    // MARK: - Mapping

    private static func mapWorkout(_ w: HKWorkout, avgHR: Double?) -> HealthKitWorkout {
        HealthKitWorkout(
            hk_uuid: w.uuid.uuidString,
            started_at: iso.string(from: w.startDate),
            date: localDay.string(from: w.startDate),
            modality: modalityLabel(w.workoutActivityType),
            movement_id: nil,                       // server alias-resolves modality → movement_id
            duration_min: w.duration / 60.0,
            distance_m: w.totalDistance?.doubleValue(for: .meter()),
            active_energy_kcal: w.totalEnergyBurned?.doubleValue(for: .kilocalorie()),
            avg_hr: avgHR.map { Int($0.rounded()) },
            intensity: inferIntensity(avgHR: avgHR)
        )
    }

    /// Rough easy/moderate/hard from average heart rate. We don't have the user's
    /// age/max-HR in this static mapper, so this uses absolute-BPM bands rather than
    /// %HRmax zones — deliberately coarse and only a hint (the user can override).
    /// Returns nil when there's no HR sample, so the cardio_sessions CHECK
    /// (intensity IN 'easy'|'moderate'|'hard', or NULL) is never violated.
    private static func inferIntensity(avgHR: Double?) -> String? {
        guard let hr = avgHR, hr > 0 else { return nil }
        switch hr {
        case ..<120:    return "easy"
        case 120..<150: return "moderate"
        default:        return "hard"
        }
    }

    /// Human-readable modality string the backend can alias-resolve to a conditioning
    /// movement (e.g. "stationary bike" → stationary_bike). Falls back to "workout".
    private static func modalityLabel(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .walking:                       return "walking"
        case .running:                       return "running"
        case .cycling:                       return "cycling"
        case .rowing:                        return "rowing"
        case .elliptical:                    return "elliptical"
        case .stairClimbing:                 return "stair climbing"
        case .hiking:                        return "hiking"
        case .highIntensityIntervalTraining: return "hiit"
        case .swimming:                      return "swimming"
        case .functionalStrengthTraining,
             .traditionalStrengthTraining:   return "strength training"
        default:                             return "workout"
        }
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let localDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}
