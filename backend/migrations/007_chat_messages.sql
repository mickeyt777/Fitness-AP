-- Migration 007: chat_messages table
-- Stores every message the user sends through the chat interface.
-- raw_text is what the user typed.
-- parsed_payload is the JSON the parser extracted (sets, macros, side-effect notes, etc.).
-- parser_source tells us whether the on-device Foundation Models or the cloud LLM did the parsing.

CREATE TABLE IF NOT EXISTS chat_messages (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at          DATETIME NOT NULL DEFAULT (datetime('now')),
  role             TEXT NOT NULL CHECK(role IN ('user','assistant')),
  raw_text         TEXT NOT NULL,
  parsed_payload   TEXT,                -- JSON; null if the message was informational
  parser_source    TEXT CHECK(parser_source IN ('on_device','cloud','none')),
  parser_confidence REAL CHECK(parser_confidence BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_sent ON chat_messages(user_id, sent_at);
