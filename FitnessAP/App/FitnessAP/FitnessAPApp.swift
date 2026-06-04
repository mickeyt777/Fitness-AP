//
//  FitnessAPApp.swift
//  FitnessAP
//
//  Created by Mickey on 5/25/26.
//

import SwiftUI

@main
struct FitnessAPApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            if appState.isLoggedIn {
                MainTabView()
                    .environmentObject(appState)
                    .fullScreenCover(isPresented: $appState.showingOnboarding) {
                        OnboardingView()
                            .environmentObject(appState)
                    }
            } else {
                // Debug builds keep the dev login screen so the X-User-Id
                // workflow stays intact. Release builds show the real
                // Sign in with Apple screen.
                #if DEBUG
                DevLoginView()
                    .environmentObject(appState)
                #else
                SignInView()
                    .environmentObject(appState)
                #endif
            }
        }
    }
}
