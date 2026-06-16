-- Migration 011: unit_system preference on profiles
-- Stores whether a user prefers metric or imperial display units.
-- The backend always stores values in metric (kg, cm). This is a display-only preference.
-- Default is 'metric' so existing rows stay unchanged.

ALTER TABLE profiles ADD COLUMN unit_system TEXT NOT NULL DEFAULT 'metric';
