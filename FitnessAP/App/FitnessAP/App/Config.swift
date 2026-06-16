// Config.swift
// Single source of truth for environment-dependent settings.
// baseURL resolves from (in priority order):
//   1. Info.plist "API_BASE_URL" (set per-build-config via an .xcconfig) — preferred for release
//   2. DEBUG fallback to localhost for simulator/dev
//   3. Release fallback to the production host
//
// To point a build at a different backend, set API_BASE_URL in the build
// configuration's .xcconfig (or scheme env var) — no source edits needed.

import Foundation

enum Config {
    static let baseURL: String = {
        if let fromPlist = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           !fromPlist.trimmingCharacters(in: .whitespaces).isEmpty {
            return fromPlist
        }
        #if DEBUG
        return "http://localhost:3000"
        #else
        return "https://api.fitnessap.com"   // TODO: confirm prod host before release
        #endif
    }()
}
