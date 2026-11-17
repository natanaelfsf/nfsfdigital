CREATE TABLE IF NOT EXISTS bt_version_guards (
  user_id TEXT PRIMARY KEY REFERENCES bt_users(id),
  expected_version INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS bt_check_user_version
BEFORE INSERT ON bt_version_guards
WHEN (SELECT version FROM bt_users WHERE id=NEW.user_id) != NEW.expected_version
BEGIN SELECT RAISE(ABORT,'bt_version_conflict'); END;
CREATE TABLE IF NOT EXISTS bt_invite_guards (
  user_id TEXT PRIMARY KEY REFERENCES bt_users(id)
);
CREATE TABLE IF NOT EXISTS bt_finance (
  singleton INTEGER PRIMARY KEY CHECK (singleton=1),
  content TEXT NOT NULL CHECK (json_valid(content)),
  version INTEGER NOT NULL DEFAULT 1
);
