/**
 * Request body validation helpers
 *
 * Lightweight validation that catches common mistakes before they reach
 * the database layer. Not a full schema validator — just enough to return
 * a clean 400 error instead of a confusing 500.
 *
 * Usage in a route:
 *   const { requireFields, validateRange } = require('../middleware/validate');
 *
 *   router.post('/', (req, res, next) => {
 *     const err = requireFields(req.body, ['user_id', 'date']) ||
 *                 validateRange(req.body.energy_1_10, 'energy_1_10', 1, 10);
 *     if (err) return res.status(400).json({ error: err });
 *     // ... proceed
 *   });
 */

'use strict';

/**
 * requireFields(body, fields)
 * Returns an error string if any required field is missing or empty.
 * Returns null if all fields are present.
 */
function requireFields(body, fields) {
  for (const field of fields) {
    const val = body?.[field];
    if (val === undefined || val === null || val === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

/**
 * validateRange(value, fieldName, min, max)
 * Returns an error string if value is outside [min, max].
 * Returns null if value is null/undefined (field is optional) or in range.
 */
function validateRange(value, fieldName, min, max) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (isNaN(num) || num < min || num > max) {
    return `${fieldName} must be between ${min} and ${max}`;
  }
  return null;
}

/**
 * validateEnum(value, fieldName, allowed)
 * Returns an error string if value is not in the allowed list.
 * Returns null if value is null/undefined (field is optional).
 */
function validateEnum(value, fieldName, allowed) {
  if (value === null || value === undefined) return null;
  if (!allowed.includes(value)) {
    return `${fieldName} must be one of: ${allowed.join(', ')}`;
  }
  return null;
}

/**
 * validateDate(value, fieldName)
 * Returns an error string if value is not a valid ISO date (YYYY-MM-DD).
 */
function validateDate(value, fieldName) {
  if (value === null || value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) {
    return `${fieldName} must be a valid date in YYYY-MM-DD format`;
  }
  return null;
}

/**
 * firstError(...errorStrings)
 * Returns the first non-null error string, or null if all pass.
 * Handy for chaining multiple validations.
 *
 * Example:
 *   const err = firstError(
 *     requireFields(body, ['user_id']),
 *     validateRange(body.energy_1_10, 'energy_1_10', 1, 10),
 *     validateDate(body.date, 'date')
 *   );
 */
function firstError(...results) {
  return results.find(r => r !== null) ?? null;
}

module.exports = { requireFields, validateRange, validateEnum, validateDate, firstError };
