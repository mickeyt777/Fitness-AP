// APIClient.swift
// All communication with the Fitness AP backend lives here.
// Every other file in the app calls these methods — nothing else touches URLSession.
//
// Dev mode: set devUserId and the X-User-Id header is sent instead of an Apple JWT.
// Production: swap requireUser middleware to read Authorization: Bearer <apple_token>.

import Foundation

// MARK: - Errors

enum APIError: Error, LocalizedError {
    case badURL
    case networkError(Error)
    case httpError(statusCode: Int, body: String)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .badURL:
            return "Invalid URL — check Config.baseURL"
        case .networkError(let e):
            return "Network error: \(e.localizedDescription)"
        case .httpError(let code, let body):
            return "HTTP \(code): \(body)"
        case .decodingError(let e):
            return "Decode error: \(e.localizedDescription)"
        }
    }
}

// MARK: - APIClient

final class APIClient {
    static let shared = APIClient()

    /// Production: set by AppState.signIn(userId:sessionToken:) after Apple auth.
    /// Sent as `Authorization: Bearer <token>` on every request.
    var sessionToken: String?

    /// Dev mode only: set by AppState.signIn(userId:) in DevLoginView.
    /// Sent as `X-User-Id` header. Ignored when sessionToken is set.
    var devUserId: String?

    private let session: URLSession
    private let decoder = JSONDecoder()

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // MARK: - Internal helpers

    private func buildRequest(
        method: String,
        path: String,
        body: (any Encodable)? = nil,
        asUserId: String? = nil
    ) throws -> URLRequest {
        guard let url = URL(string: Config.baseURL + path) else {
            throw APIError.badURL
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Auth header — prefer the backend session JWT (production), fall back to
        // the dev X-User-Id header when no session token is present.
        if let token = sessionToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else if let uid = asUserId ?? devUserId {
            req.setValue(uid, forHTTPHeaderField: "X-User-Id")
        }

        if let body {
            req.httpBody = try JSONEncoder().encode(body)
        }
        return req
    }

    /// Performs a request and decodes the response body as T.
    private func perform<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "(empty)"
            throw APIError.httpError(statusCode: http.statusCode, body: body)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Like perform, but returns nil when the server sends JSON `null`.
    /// Used by endpoints like GET /checkins/:userId/today that legitimately return null.
    private func performOptional<T: Decodable>(_ req: URLRequest) async throws -> T? {
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "(empty)"
            throw APIError.httpError(statusCode: http.statusCode, body: body)
        }
        if data == Data("null".utf8) { return nil }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Auth

    /// Sends an Apple identity token to the backend. Returns a 30-day session JWT.
    /// Call this once after a successful Sign in with Apple. Store the result in the Keychain.
    func appleSignIn(identityToken: String, displayName: String?) async throws -> AppleSignInResponse {
        struct Body: Encodable { let identity_token: String; let display_name: String? }
        let req = try buildRequest(method: "POST", path: "/auth/apple",
                                   body: Body(identity_token: identityToken, display_name: displayName))
        return try await perform(req)
    }

    // MARK: - Health

    func health() async throws -> HealthResponse {
        let req = try buildRequest(method: "GET", path: "/health")
        return try await perform(req)
    }

    // MARK: - Users

    func createUser(id: String, displayName: String) async throws -> UserModel {
        struct Body: Encodable { let id: String; let display_name: String }
        let req = try buildRequest(method: "POST", path: "/users", body: Body(id: id, display_name: displayName))
        return try await perform(req)
    }

    // MARK: - Profiles

    func getProfile(userId: String) async throws -> Profile {
        let req = try buildRequest(method: "GET", path: "/profiles/\(userId)", asUserId: userId)
        return try await perform(req)
    }

    func upsertProfile(userId: String, body: UpsertProfileBody) async throws -> Profile {
        let req = try buildRequest(method: "PUT", path: "/profiles/\(userId)", body: body, asUserId: userId)
        return try await perform(req)
    }

    // MARK: - Workouts

    /// Returns this week's personalised workout plan as an array of sessions.
    func getWorkoutPlan(userId: String) async throws -> WorkoutPlan {
        let req = try buildRequest(method: "GET", path: "/workouts/\(userId)/plan", asUserId: userId)
        return try await perform(req)
    }

    // MARK: - Macros

    func getMacros(userId: String) async throws -> MacroResult {
        let req = try buildRequest(method: "GET", path: "/macros/\(userId)", asUserId: userId)
        return try await perform(req)
    }

    func getFoodLeaderboard(userId: String) async throws -> [FoodItem] {
        let req = try buildRequest(method: "GET", path: "/macros/\(userId)/leaderboard", asUserId: userId)
        return try await perform(req)
    }

    // MARK: - Check-ins

    /// Returns today's check-in, or nil if the user hasn't checked in yet.
    func getTodayCheckin(userId: String) async throws -> CheckIn? {
        let req = try buildRequest(method: "GET", path: "/checkins/\(userId)/today", asUserId: userId)
        return try await performOptional(req)
    }

    func submitCheckin(userId: String, body: SubmitCheckinBody) async throws -> CheckInResponse {
        let req = try buildRequest(method: "POST", path: "/checkins", body: body, asUserId: userId)
        return try await perform(req)
    }

    // MARK: - Chat

    func getChatHistory(userId: String) async throws -> [ChatMessage] {
        let req = try buildRequest(method: "GET", path: "/chat/\(userId)", asUserId: userId)
        return try await perform(req)
    }

    func sendChat(userId: String, body: SendChatBody) async throws -> ChatResponse {
        let req = try buildRequest(method: "POST", path: "/chat", body: body, asUserId: userId)
        return try await perform(req)
    }

    // MARK: - AI parse

    func aiParse(userId: String, rawText: String) async throws -> AiParseResponse {
        struct Body: Encodable { let raw_text: String }
        let req = try buildRequest(method: "POST", path: "/ai/chat-parse",
                                   body: Body(raw_text: rawText), asUserId: userId)
        return try await perform(req)
    }

    // MARK: - Movement alias resolution (P1-D)

    /// Resolves a spoken/typed exercise name to canonical movement(s) via
    /// GET /movements/search?q=. Returns the best match plus ranked candidates.
    func searchMovement(userId: String, query: String) async throws -> MovementSearchResult {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let req = try buildRequest(method: "GET",
                                   path: "/movements/search?q=\(encoded)",
                                   asUserId: userId)
        return try await perform(req)
    }

    // MARK: - Measurements

    /// Fetches body measurement history. `weeks` controls how far back to look (default 26).
    /// Pass a large value (e.g. 520) to get all-time data.
    func getMeasurements(userId: String, weeks: Int = 26) async throws -> [BodyMeasurement] {
        let req = try buildRequest(method: "GET",
                                   path: "/measurements/\(userId)?weeks=\(weeks)",
                                   asUserId: userId)
        return try await perform(req)
    }

    /// Logs a new measurement entry (weight and/or body measurements).
    func logMeasurement(userId: String, body: LogMeasurementBody) async throws -> MeasurementResponse {
        let req = try buildRequest(method: "POST", path: "/measurements", body: body, asUserId: userId)
        return try await perform(req)
    }

    // MARK: - Check-in history

    /// Fetches check-in history. `days` controls how far back to look (default 30).
    func getCheckins(userId: String, days: Int = 30) async throws -> [CheckIn] {
        let req = try buildRequest(method: "GET",
                                   path: "/checkins/\(userId)?days=\(days)",
                                   asUserId: userId)
        return try await perform(req)
    }
}
