'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { httpError } = require('../lib/httpError');
const env = require('../config/env');

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
      endpoint:    env.B2_ENDPOINT,
      credentials: {
        accessKeyId:     env.B2_APPLICATION_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
      },
      forcePathStyle: true,  // required for Backblaze B2
    });
  } catch (_) {
    s3Client = false;
  }
}

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

  if (!env.B2_APPLICATION_KEY_ID) {
    console.log(`[photos] STUB — would upload ${objectKey} (${buffer.length} bytes) to B2`);
    return { stub: true };
  }

  await s3Client.send(new PutObjectCommand({
    Bucket:      env.B2_BUCKET_NAME,
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
      new GetObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: objectKey }),
      { expiresIn: 3600 }  // 1 hour
    );
  } catch (_) {
    return null;
  }
}

// POST /:userId — after multer has parsed the file in the route.
// Uploads to B2 (or stubs), stores the record, returns the response body.
async function savePhoto(userId, file, takenAt, notes) {
  const objectKey = buildObjectKey(userId, file.mimetype);

  // Upload to B2 (or stub if credentials not configured)
  const uploadResult = await uploadToB2(objectKey, file.buffer, file.mimetype);

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
    file.size,
    file.mimetype,
    notes,
    uploadResult.stub ? 1 : 0,
    now
  );

  const presignedUrl = uploadResult.stub ? null : await generatePresignedUrl(objectKey);

  return {
    id,
    object_key:   objectKey,
    taken_at:     takenAt,
    size_bytes:   file.size,
    content_type: file.mimetype,
    url:          presignedUrl,
    stub:         uploadResult.stub,
  };
}

// GET /:userId
async function listPhotos(userId, limitParam) {
  const limit = Math.min(parseInt(limitParam ?? 20), 100);
  const db    = getDb();

  const photos = db.prepare(`
    SELECT id, object_key, taken_at, size_bytes, content_type, notes, is_stub, created_at
    FROM photos
    WHERE user_id = ?
    ORDER BY taken_at DESC
    LIMIT ?
  `).all(userId, limit);

  // Generate presigned URLs for non-stub photos.
  const results = await Promise.all(photos.map(async (p) => ({
    ...p,
    is_stub: p.is_stub === 1,
    url: p.is_stub ? null : await generatePresignedUrl(p.object_key),
  })));

  return { photos: results };
}

// DELETE /:userId/:photoId
function deletePhoto(userId, photoId) {
  const db    = getDb();
  const photo = db.prepare(
    'SELECT id, object_key, is_stub FROM photos WHERE id = ? AND user_id = ?'
  ).get(photoId, userId);

  if (!photo) {
    throw httpError(404, 'Photo not found');
  }

  // Delete from B2 (fire-and-forget — don't block the response)
  if (!photo.is_stub) {
    loadS3();
    if (s3Client && env.B2_BUCKET_NAME) {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      s3Client.send(new DeleteObjectCommand({
        Bucket: env.B2_BUCKET_NAME,
        Key:    photo.object_key,
      })).catch(err => {
        console.warn('[photos] B2 delete failed for', photo.object_key, err.message);
      });
    }
  }

  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);

  return { deleted: true };
}

module.exports = { savePhoto, listPhotos, deletePhoto };
