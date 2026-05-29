//
//  ContentView.swift
//  FitnessAP
//
//  Created by Mickey on 5/25/26.
//

import SwiftUI

// MainTabView — the five-tab shell of the app.
// ContentView is kept as a thin wrapper so FitnessAPApp.swift stays clean.

struct ContentView: View {
    var body: some View {
        MainTabView()
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.max") }

            WorkoutView()
                .tabItem { Label("Workout", systemImage: "dumbbell") }

            NutritionView()
                .tabItem { Label("Nutrition", systemImage: "fork.knife") }

            ProgressScreenView()
                .tabItem { Label("Progress", systemImage: "chart.line.uptrend.xyaxis") }

            CoachView()
                .tabItem { Label("Coach", systemImage: "bubble.left.and.bubble.right") }
        }
        .toolbarBackground(.visible, for: .tabBar)
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState())
}
