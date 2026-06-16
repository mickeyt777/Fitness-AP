// MacroModels.swift
import Foundation

// MARK: - Macros

struct MacroResult: Decodable {
    let protein_g: Int
    let fat_g: Int
    let carbs_g: Int
    let calories_floor: Int
    let goal_lbm_kg: Double?
    let goal_lbm_lbs: Double?
    let body_fat_pct: Double?
    let notes: [String]?
}

// MARK: - Food leaderboard

struct FoodItem: Decodable, Identifiable {
    var id: String { food }
    let food: String
    let protein_g_per_100_kcal: Double
    let notes: String?
}
