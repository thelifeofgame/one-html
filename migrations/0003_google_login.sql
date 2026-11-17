CREATE TABLE auth_identities (
  provider TEXT NOT NULL CHECK(provider='google'),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(provider,subject),
  UNIQUE(provider,user_id)
);
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
