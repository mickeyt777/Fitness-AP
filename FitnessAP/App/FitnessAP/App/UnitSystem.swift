// UnitSystem.swift
// Conversion helpers for metric ↔ imperial display.
//
// Rule: the backend always stores in metric (kg, cm).
// This enum handles converting to display units and back for storage.
// Every view that shows or accepts a measurement value should go through here.

import Foundation

enum UnitSystem: String, CaseIterable {
    case metric   = "metric"
    case imperial = "imperial"

    var label: String { self == .metric ? "Metric" : "Imperial" }

    // MARK: - Weight (kg ↔ lbs)

    var weightUnit: String { self == .metric ? "kg" : "lbs" }

    /// Convert a stored kg value to display units.
    func displayWeight(_ kg: Double) -> Double {
        self == .metric ? kg : kg * 2.20462
    }

    /// Convert a user-entered display-unit value back to kg for storage.
    func storeWeight(_ displayed: Double) -> Double {
        self == .metric ? displayed : displayed / 2.20462
    }

    /// Format a stored kg value with unit suffix for display.
    func formatWeight(_ kg: Double, decimals: Int = 1) -> String {
        String(format: "%.\(decimals)f \(weightUnit)", displayWeight(kg))
    }

    /// Stepper range for weight input (in display units).
    var weightRange: ClosedRange<Double> {
        self == .metric ? 40...250 : 88...551
    }

    /// Stepper step size for weight input (in display units).
    var weightStep: Double { self == .metric ? 0.5 : 1.0 }

    // MARK: - Body measurements (cm ↔ inches)

    var lengthUnit: String { self == .metric ? "cm" : "in" }

    /// Convert a stored cm value to display units.
    func displayLength(_ cm: Double) -> Double {
        self == .metric ? cm : cm * 0.393701
    }

    /// Convert a user-entered display-unit value back to cm for storage.
    func storeLength(_ displayed: Double) -> Double {
        self == .metric ? displayed : displayed / 0.393701
    }

    /// Format a stored cm value with unit suffix for display.
    func formatLength(_ cm: Double, decimals: Int = 1) -> String {
        String(format: "%.\(decimals)f \(lengthUnit)", displayLength(cm))
    }

    // MARK: - Height (cm ↔ ft + in)
    //
    // Height is special — imperial uses compound ft/in input rather than
    // a single decimal field. Use the helpers below for breakdown and assembly.

    var heightUnit: String { self == .metric ? "cm" : "ft / in" }

    /// Break a stored cm value into (feet, inches) for imperial display.
    static func cmToFtIn(_ cm: Double) -> (feet: Int, inches: Int) {
        let totalInches = cm * 0.393701
        let feet   = Int(totalInches / 12)
        let inches = Int(totalInches.truncatingRemainder(dividingBy: 12).rounded())
        return (feet, inches)
    }

    /// Assemble separate ft + in values into cm for storage.
    static func ftInToCm(feet: Int, inches: Int) -> Double {
        Double(feet * 12 + inches) / 0.393701
    }

    /// Format a stored cm height for display (e.g. "170 cm" or "5 ft 7 in").
    func formatHeight(_ cm: Double) -> String {
        if self == .metric {
            return "\(Int(cm)) cm"
        }
        let (ft, inches) = UnitSystem.cmToFtIn(cm)
        return "\(ft) ft \(inches) in"
    }

    // MARK: - Weight delta formatting (for chart summaries)

    /// Format a kg delta (e.g. from chart range) with sign and unit.
    func formatWeightDelta(_ deltaKg: Double) -> String {
        let val  = displayWeight(abs(deltaKg))
        let sign = deltaKg < 0 ? "−" : "+"
        return String(format: "\(sign)%.1f \(weightUnit)", val)
    }

    /// Format a cm delta (e.g. from chart range) with sign and unit.
    func formatLengthDelta(_ deltaCm: Double) -> String {
        let val  = displayLength(abs(deltaCm))
        let sign = deltaCm < 0 ? "−" : "+"
        return String(format: "\(sign)%.1f \(lengthUnit)", val)
    }
}
