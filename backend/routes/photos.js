/**
 * /photos routes
 *
 * POST /photos/:userId — upload a body-scan / progress photo
 * GET  /photos/:userId — list photo records for a user
 *
 * Photos are stored in Backblaze B2 (S3-compatible). Only the object key
 * (storage path) and metadata are stored in SQLite — never the raw image bytes.
 *
 * ── Required env vars ───────────────────────────────────────────────────────
 *   B2_APPLICATION_KEY_ID  — Backblaze key ID
 *   B2_APPLICATION_KEY     — Backblaze application key
 *   B2_BUCKET_NAME         — bucket name (e.g. fitnessap-photos)
 *   B2_ENDPOINT            — S3-compatible endpoint
 *                            e.g. https://s3.us-east-005.backblazeb2.com
 *
 * ── Dependency ──────────────────────────────────────────────────────────────
 *   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer
 *
 * Multer parses multipart/form-data. The S3 client handles B2 because B2 is
 * S3-compatible when you point it at the right endpoint.
 *
 * ── Privacy / encryption ────────────────────────────────────────────────────
 * The bucket should have SSE-B2 encryption enabled (Backblaze default).
 * Photos are stored under a path of: {userId}/{year-month}/{uuid}.jpg
 * The bucket should NOT be public — use presigned URLs for access.
 *
 * ── Stub mode ───────────────────────────────────────────────────────────────
 * If B2_APPLICATION_KEY_ID is not set, uploads are accepted and logged but
 * no file is actually sent to B2. Safe for local dev.
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const { getDb }        = require('../db/database');
const { requireUser }  = require('../middleware/requireUser');
const { requireSubscription } = require('../middleware/requireSubscription');

const router = express.Router();

// ── S3 / B2 client (lazy-loaded) ──────────────────────────────────────────

let s3Client   = null;
let PutObjectCommand = null;
let GetObjectCommand = null;
let getSignedUrl = null;

function loadS3() {
  if (s3Client !== null) return; // already attempted
  try {
    const { S3Client, PutObjectCommand: Put, GetObjectCommand: Get } = require('@aws-sdk/client-s3');
    const { getSignedUrl: gsu } = require('@aws-sdk/s3-request-presigner');
    PutObjectCommand = Put;
    GetObjectCommand = Get;
    getSignedUrl     = gsu;
    s3Client = new S3Client({
      region:      'us-east-1',  // B2 ignores region but SDK requires one
      endpoint:    process.env.B2_ENDPOINT,
      credentials: {
        accessKeyId:     process.env.B2_APPLICATION_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY,
      },
      forcePathStyle: true,  // required for Backblaze B2
    });
  } catch (_) {
    s3Client = false;
  }
}

// ── Multer config ─────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────

function buildObjectKey(userId, originalMimetype) {
  const ext     = originalMimetype === 'image/png' ? 'png' :
                  (originalMimetype === 'image/webp' ? 'webp' : 'jpg');
  const yearMonth = new Date().toISOString().slice(0, 7);   // '2025-01'
  return `${userId}/${yearMonth}/${uuidv4()}.${ext}`;
}

async function uploadToB2(objectKey, buffer, contentType) {
  loadS3();

  if (!s3Client) {
    console.warn('[photos] @aws-sdk/client-s3 not installed — run: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner');
    return { stub: true };
  }

  if (!process.env.B2_APPLICATION_KEY_ID) {
    console.log(`[photos] STUB — would upload ${objectKey} (${buffer.length} bytes) to B2`);
    return { stub: true };
  }

  await s3Client.send(new PutObjectCommand({
    Bucket:      process.env.B2_BUCKET_NAME,
    Key:         objectKey,
    Body:        buffer,
    ContentType: contentType,
  }));

  return { stub: false };
}

async function generatePresignedUrl(objectKey) {
  loadS3();
  if (!s3Client || typeof getSignedUrl !== 'function') return null;

  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: objectKey }),
      { expiresIn: 3600 }  // 1 hour
    );
  } catch (_) {
    return null;
  }
}

// ── POST /photos/:userId ──────────────────────────────────────────────────
//
// Accepts a multipart/form-data POST with a single 'photo' field.
// Optional form fields:
//   taken_at     — ISO date string (defaults to now)
//   notes        — free text, stored in the photo record

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
      const userId    = req.params.userId;
      const takenAt   = req.body?.taken_at ?? new Date().toISOString();
      const notes     = req.body?.notes    ?? null;
      const objectKey = buildObjectKey(userId, req.file.mimetype);

      // Upload to B2 (or stub if credentials not configured)
      const uploadResult = await uploadToB2(objectKey, req.file.buffer, req.file.mimetype);

      // Store the record in SQLite
      const db  = getDb();
      const id  = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO photos (id, user_id, object_key, taken_at, size_bytes, content_type, notes, is_stub, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        objectKey,
        takenAt,
        req.file.size,
        req.file.mimetype,
        notes,
        uploadResult.stub ? 1 : 0,
        now
      );

      const presignedUrl = uploadResult.stub ? null : await generatePresignedUrl(objectKey);

      return res.status(201).json({
        id,
        object_key:   objectKey,
        taken_at:     takenAt,
        size_bytes:   req.file.size,
        content_type: req.file.mimetype,
        url:          presignedUrl,
        stub:         uploadResult.stub,
      });

    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

// ── GET /photos/:userId ───────────────────────────────────────────────────
//
// Returns the last N photo records. Presigned URLs are generated on the fly
// so clients can display photos without a separate auth step.

router.get('/:userId', requireUser, requireSubscription, async (req, res, next) => {
  try {
    if (req.userId !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const limit = Math.min(parseInt(req.query.limit ?? 20), 100);
    const db    = getDb();

    const photos = db.prepare(`
      SELECT id, object_key, taken_at, size_bytes, content_type, notes, is_stub, created_at
      FROM photos
      WHERE user_id = ?
      ORDER BY taken_at DESC
      LIMIT ?
    `).all(req.params.userId, limit);

    // Generate presigned URLs for non-stub photos.
    const results = await Promise.all(photos.map(async (p) => ({
      ...p,
      is_stub: p.is_stub === 1,
      url: p.is_stub ? null : await generatePresignedUrl(p.object_key),
    })));

    return res.json({ photos: results });

  } catch (err) {
    next(err);
  }
});

// ── DELETE /photos/:userId/:photoId ──────────────────────────────────────
//
// Removes the photo record from SQLite and deletes from B2.

router.delete('/:userId/:photoId', requireUser, (req, res, next) => {
  try {
    if (req.userId !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const db    = getDb();
    const photo = db.prepare(
      'SELECT id, object_key, is_stub FROM photos WHERE id = ? AND user_id = ?'
    ).get(req.params.photoId, req.params.userId);

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Delete from B2 (fire-and-forget — don't block the response)
    if (!photo.is_stub) {
      loadS3();
      if (s3Client && process.env.B2_BUCKET_NAME) {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.B2_BUCKET_NAME,
          Key:    photo.object_key,
        })).catch(err => {
          console.warn('[photos] B2 delete failed for', photo.object_key, err.message);
        });
      }
    }

    db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);

    return res.json({ deleted: true });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
