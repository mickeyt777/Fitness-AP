/**
 * Application-level encryption for sensitive columns.
 *
 * Sensitive fields — drug name, dose, body measurements, photo URLs — are
 * encrypted with AES-256-GCM before being written to SQLite. This means that
 * even if someone copies the database file, they can't read the sensitive data
 * without the ENCRYPTION_KEY from your .env file.
 *
 * AES-256-GCM:
 *   - AES-256 = strong 256-bit symmetric encryption
 *   - GCM = mode that also detects tampering (it's "authenticated encryption")
 *   - Each value gets a random IV (initialization vector) so the same value
 *     encrypted twice produces different ciphertext — harder to attack.
 *
 * Format stored in the database:
 *   <base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * If ENCRYPTION_KEY is not set (e.g. in a development environment where you
 * haven't configured .env yet), the functions return the plain value so the
 * app still works. Log a warning so you notice.
 */

'use strict';

const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = env.ENCRYPTION_KEY;
  if (!hex) {
    // Development convenience — not safe for production.
    return null;
  }
  return Buffer.from(hex, 'hex');
}

/**
 * encrypt(plaintext)
 * Returns an encrypted string suitable for storing in SQLite.
 * Returns the original value unchanged if no key is configured.
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;

  const key = getKey();
  if (!key) {
    if (!env.isTest) {
      console.warn('[encrypt] WARNING: ENCRYPTION_KEY not set — storing sensitive data in plaintext');
    }
    return String(plaintext);
  }

  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map(b => b.toString('base64')).join(':');
}

/**
 * decrypt(stored)
 * Reverses encrypt(). Returns null for null/undefined inputs.
 */
function decrypt(stored) {
  if (stored === null || stored === undefined) return stored;

  const key = getKey();
  if (!key) return stored; // no key — value was stored as plaintext

  // If the stored value doesn't look like our encrypted format, return as-is.
  // This handles plain-text values written before encryption was enabled.
  if (!stored.includes(':')) return stored;

  const parts = stored.split(':');
  if (parts.length !== 3) return stored;

  const [ivB64, authTagB64, encryptedB64] = parts;
  const iv         = Buffer.from(ivB64, 'base64');
  const authTag    = Buffer.from(authTagB64, 'base64');
  const encrypted  = Buffer.from(encryptedB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
