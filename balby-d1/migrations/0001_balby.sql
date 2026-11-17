PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bt_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','professor','aluno')),
  password_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  profile TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(profile)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS bt_setup (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  user_id TEXT NOT NULL REFERENCES bt_users(id)
);
CREATE TABLE IF NOT EXISTS bt_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES bt_users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bt_sessions_user ON bt_sessions(user_id);
CREATE TABLE IF NOT EXISTS bt_teacher_students (
  teacher_id TEXT NOT NULL REFERENCES bt_users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES bt_users(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id,student_id)
);
CREATE TABLE IF NOT EXISTS bt_documents (
  user_id TEXT NOT NULL REFERENCES bt_users(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id,area)
);
CREATE TABLE IF NOT EXISTS bt_daily (
  user_id TEXT NOT NULL REFERENCES bt_users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id,day)
);
CREATE TABLE IF NOT EXISTS bt_invites (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  name TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  invited_by TEXT NOT NULL REFERENCES bt_users(id)
);
CREATE TABLE IF NOT EXISTS bt_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES bt_users(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES bt_users(id),
  content TEXT NOT NULL CHECK (json_valid(content)),
  request_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(author_id,request_key)
);
CREATE INDEX IF NOT EXISTS bt_entries_student ON bt_entries(user_id,area,created_at);
CREATE TABLE IF NOT EXISTS bt_files (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL UNIQUE REFERENCES bt_entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 10485760)
);
CREATE TABLE IF NOT EXISTS bt_file_chunks (
  file_id TEXT NOT NULL REFERENCES bt_files(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY(file_id,part)
);
CREATE TABLE IF NOT EXISTS bt_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS bt_login_attempts (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
