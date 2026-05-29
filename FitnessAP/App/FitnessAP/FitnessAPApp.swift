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
                DevLoginView()
                    .environmentObject(appState)
            }
        }
    }
}
