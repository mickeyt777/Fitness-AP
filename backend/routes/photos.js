/**
 * /photos routes
 *
 * POST   /photos/:userId          — upload a body-scan / progress photo
 * GET    /photos/:userId          — list photo records for a user
 * DELETE /photos/:userId/:photoId — remove a photo record + B2 object
 *
 * Photos live in Backblaze B2 (S3-compatible); only the object key + metadata
 * are stored in SQLite. All B2/storage + DB logic lives in
 * services/photoService.js. This route keeps the HTTP concerns: multipart
 * parsing (multer), ownership checks, and upload-error status mapping.
 *
 * Required env vars + deps are documented in services/photoService.js usage:
 *   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer
 *
 * Stub mode: if B2_APPLICATION_KEY_ID is unset, uploads are accepted and logged
 * but nothing is sent to B2 (safe for local dev).
 */

'use strict';

const express = require('express');
const { requireUser }  = require('../middleware/requireUser');
const { requireSubscription } = require('../middleware/requireSubscription');
const photoService = require('../services/photoService');

const router = express.Router();

// ── Multer config (multipart/form-data parsing) ───────────────────────────
let multerUpload = null;

function getMulterUpload() {
  if (multerUpload !== null) return multerUpload;
  try {
    const multer = require('multer');
    // Store in memory for immediate upload — no temp files on disk.
    const storage = multer.memoryStorage();
    multerUpload = multer({
      storage,
      limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
      fileFilter(req, file, cb) {
        const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Only JPEG, PNG, HEIC, and WebP images are accepted.'));
        }
      },
    }).single('photo');
    return multerUpload;
  } catch (_) {
    return null;
  }
}

// ── POST /photos/:userId ──────────────────────────────────────────────────
// Accepts a multipart/form-data POST with a single 'photo' field.
// Optional form fields: taken_at (ISO date), notes (free text).
router.post('/:userId', requireUser, requireSubscription, (req, res, next) => {
  const upload = getMulterUpload();

  if (!upload) {
    return res.status(503).json({
      error: 'Photo uploads unavailable',
      hint: 'Run: npm install multer @aws-sdk/client-s3 @aws-sdk/s3-request-presigner',
    });
  }

  if (req.userId !== req.params.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Photo must be under 15 MB' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo file received. Send a multipart/form-data POST with field name "photo".' });
    }

    try {
      const takenAt = req.body?.taken_at ?? new Date().toISOString();
      const notes   = req.body?.notes    ?? null;
      const result  = await photoService.savePhoto(req.params.userId, req.file, takenAt, notes);
      return res.status(201).json(result);
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

// ── GET /photos/:userId ───────────────────────────────────────────────────
router.get('/:userId', requireUser, requireSubscription, async (req, res, next) => {
  try {
    if (req.userId !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(await photoService.listPhotos(req.params.userId, req.query.limit));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /photos/:userId/:photoId ──────────────────────────────────────
router.delete('/:userId/:photoId', requireUser, (req, res, next) => {
  try {
    if (req.userId !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(photoService.deletePhoto(req.params.userId, req.params.photoId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
