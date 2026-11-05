-- Accounts and personal tracking. Run with: npx wrangler d1 migrations apply ow2-accounts --remote

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_id)
);

-- Only a hash of each session token is stored, so a copy of this table can't be used to sign in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_user ON sessions (user_id);
CREATE INDEX sessions_by_expiry ON sessions (expires_at);

-- A sign-in in progress: the state check and PKCE verifier from when it started.
CREATE TABLE login_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- The one-time code that hands a new session to the site, so the token never appears in a URL.
CREATE TABLE login_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- One row per mark: owned, wishlist, favorite, alert, Battle Pass tier, mythic option or claimed drop.
-- A removed mark stays as value 0, so the removal reaches the person's other devices.
CREATE TABLE entries (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (0, 1)),
  changed_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE INDEX entries_by_user_seq ON entries (user_id, seq);

CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
