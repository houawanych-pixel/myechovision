-- My Echo Vision key vault (Cloudflare D1). Apply with:
--   npx wrangler d1 execute echo-vault --remote --file=worker/vault-schema.sql
-- Nothing here ever holds a plain API key: `keys.ct` is AES-256-GCM ciphertext, sealed with a secret that lives
-- only in the Worker's secrets (VAULT_KEY). Session tokens are stored as SHA-256 hashes, never as the token.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS passkeys (
  cred_id TEXT PRIMARY KEY,          -- base64url credential id
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spki TEXT NOT NULL,                -- base64url public key (SubjectPublicKeyInfo)
  alg INTEGER NOT NULL,              -- -7 (ES256) or -257 (RS256)
  sign_count INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(user_id);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL,                -- 'reg' or 'auth'
  user_id TEXT,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  ct TEXT NOT NULL,                  -- base64 ciphertext + tag
  iv TEXT NOT NULL,                  -- base64 96-bit nonce, fresh for every save
  kv INTEGER NOT NULL,               -- which VAULT_KEY version sealed it
  created INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,                 -- YYYY-MM-DD (UTC)
  provider TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, provider)
);
CREATE TABLE IF NOT EXISTS rl (
  k TEXT PRIMARY KEY,                -- e.g. 'min:<user>:<minute>' or 'ip:<hash>:<minute>'
  n INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
