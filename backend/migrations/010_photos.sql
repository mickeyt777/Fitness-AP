-- Photos / body-scan progress images
-- The actual image bytes live in Backblaze B2 (S3-compatible object storage).
-- We store only the object key (storage path) and metadata here.
--
-- Object key format:  {userId}/{year-month}/{uuid}.{ext}
-- Access:             Generate a presigned URL via the S3 SDK — the bucket is private.

CREATE TABLE IF NOT EXISTS photos (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key    TEXT NOT NULL UNIQUE,   -- B2 path: {userId}/{year-month}/{uuid}.ext
  taken_at      TEXT NOT NULL,          -- ISO 8601 datetime the photo was taken
  size_bytes    INTEGER,
  content_type  TEXT,                   -- image/jpeg | image/png | image/heic | image/webp
  notes         TEXT,                   -- optional user annotation (free text)
  is_stub       INTEGER NOT NULL DEFAULT 0,  -- 1 = dev stub, file not in B2
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_photos_user_taken
  ON photos(user_id, taken_at DESC);
