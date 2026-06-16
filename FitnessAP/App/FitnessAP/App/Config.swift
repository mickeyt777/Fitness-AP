// Config.swift
// Single source of truth for environment-dependent settings.
// Switch baseURL by changing the active scheme's build configuration.
// TODO: wire API_BASE_URL via .xcconfig for staging/prod before release.

import Foundation

enum Config {
    #if DEBUG
    static let baseURL = "http://localhost:3000"
    #else
    static let baseURL = "https://api.fitnessap.com"   // TODO: confirm prod host before release
    #endif
}
