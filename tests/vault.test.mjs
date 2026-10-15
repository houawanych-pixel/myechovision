// Security checks for the key vault (worker/vault.js). Run: node --test tests/vault.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, Phone, signUp, fakeProviders } from './vault-env.mjs';

const GOOD = 'sk-test-GOOD0000000000000000', XGOOD = 'xai-GOOD000000000000000000';

test('health answers and says it is configured', async () => {
  const env = makeEnv(); const r = await call(env, 'GET', '/api/health');
  assert.equal(r.status, 200); assert.equal(r.data.ok, true); assert.equal(r.data.configured, true);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://myechovision.com');
});

test('other websites are refused, even before sign-in', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/api/health', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(env, 'OPTIONS', '/api/credentials', { origin: 'https://evil.example' })).status, 403);
});

test('passkey sign-up and sign-in work; a forged signature, a wrong site and a reused challenge do not', async () => {
  const env = makeEnv();
  const { phone, token, res } = await signUp(env);
  assert.equal(res.status, 200); assert.ok(token.length > 30);
  const s = await call(env, 'POST', '/api/passkey/login/start');
  const ok = await call(env, 'POST', '/api/passkey/login/finish', { body: await phone.get(s.data) });
  assert.equal(ok.status, 200); assert.ok(ok.data.token);
  // replaying the same challenge fails
  assert.equal((await call(env, 'POST', '/api/passkey/login/finish', { body: await phone.get(s.data) })).status, 400);
  const s2 = await call(env, 'POST', '/api/passkey/login/start');
  assert.equal((await call(env, 'POST', '/api/passkey/login/finish', { body: await phone.get(s2.data, { tamper: true }) })).status, 401);
  // a passkey made for another site
  const other = new Phone({ rpId: 'evil.example' }); const s3 = await call(env, 'POST', '/api/passkey/register/start');
  assert.equal((await call(env, 'POST', '/api/passkey/register/finish', { body: await other.create(s3.data) })).status, 403);
  // a page on another origin answering the challenge
  const away = new Phone({ origin: 'https://evil.example' }); const s4 = await call(env, 'POST', '/api/passkey/register/start');
  assert.equal((await call(env, 'POST', '/api/passkey/register/finish', { body: await away.create(s4.data) })).status, 403);
  // without fingerprint / screen lock
  const lazy = new Phone({ uv: false }); const s5 = await call(env, 'POST', '/api/passkey/register/start');
  assert.equal((await call(env, 'POST', '/api/passkey/register/finish', { body: await lazy.create(s5.data) })).status, 400);
});

test('unsigned requests are rejected everywhere', async () => {
  const env = makeEnv();
  for (const [m, p] of [['GET', '/api/credentials'], ['POST', '/api/credentials'], ['DELETE', '/api/credentials/openai'], ['GET', '/v1/openai/models'], ['POST', '/v1/openai/chat/completions'], ['GET', '/api/usage'], ['DELETE', '/api/account']])
    assert.equal((await call(env, m, p, { body: m === 'POST' ? {} : undefined })).status, 401, `${m} ${p}`);
  assert.equal((await call(env, 'GET', '/api/credentials', { token: 'x'.repeat(43) })).status, 401);
});

test('a key is checked, sealed, never returned, and used only for its owner', async () => {
  const env = makeEnv(); const fp = fakeProviders();
  try {
    const a = await signUp(env), b = await signUp(env);
    const bad = await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'openai', apiKey: 'sk-test-WRONG000000000000000' } });
    assert.equal(bad.status, 401); assert.match(bad.data.error.message, /did not accept/); assert.ok(!bad.text.includes('WRONG'));
    const fmt = await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'openai', apiKey: 'hello' } });
    assert.equal(fmt.status, 400);
    const ok = await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'openai', apiKey: GOOD } });
    assert.equal(ok.status, 200); assert.deepEqual(ok.data.models, ['gpt-4.1', 'gpt-4o-mini']);   // speech and embedding models filtered out
    assert.ok(!ok.text.includes(GOOD));
    // nothing in the database contains the key in plain text
    const dump = JSON.stringify(env.DB.raw.prepare('SELECT * FROM keys').all()) + JSON.stringify(env.DB.raw.prepare('SELECT * FROM sessions').all());
    assert.ok(!dump.includes(GOOD) && !dump.includes('GOOD0000')); assert.ok(!dump.includes(a.token));
    const st = await call(env, 'GET', '/api/credentials', { token: a.token });
    assert.equal(st.status, 200); assert.equal(st.data.providers.find(p => p.provider === 'openai').connected, true); assert.ok(!st.text.includes(GOOD));
    // the owner's chat goes out with the owner's key and streams back
    const c = await call(env, 'POST', '/v1/openai/chat/completions', { token: a.token, body: { model: 'gpt-4o-mini', stream: true, max_tokens: 99999, messages: [{ role: 'user', content: 'hi' }] } });
    assert.equal(c.status, 200); assert.match(c.text, /fake model/); assert.ok(!c.text.includes(GOOD));
    const sent = fp.seen.at(-1); assert.equal(sent.key, GOOD); assert.equal(sent.body.max_tokens, 2000);   // capped
    // another person cannot use it
    const other = await call(env, 'POST', '/v1/openai/chat/completions', { token: b.token, body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] } });
    assert.equal(other.status, 404); assert.equal(other.data.error.code, 'no_key');
    assert.equal(fp.seen.filter(x => x.url.includes('chat')).length, 1);
    // models list through the vault, filtered
    const m = await call(env, 'GET', '/v1/openai/models', { token: a.token });
    assert.deepEqual(m.data.data.map(x => x.id), ['gpt-4.1', 'gpt-4o-mini']);
    // a model outside the allowlist is refused before any provider call
    const n = fp.seen.length;
    assert.equal((await call(env, 'POST', '/v1/openai/chat/completions', { token: a.token, body: { model: 'whisper-1', messages: [{ role: 'user', content: 'x' }] } })).status, 400);
    assert.equal(fp.seen.length, n);
    // replace and disconnect
    assert.equal((await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'xai', apiKey: XGOOD } })).status, 200);
    assert.equal((await call(env, 'DELETE', '/api/credentials/openai', { token: a.token })).status, 200);
    assert.equal((await call(env, 'POST', '/v1/openai/chat/completions', { token: a.token, body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] } })).status, 404);
    assert.equal((await call(env, 'GET', '/api/credentials', { token: a.token })).data.providers.find(p => p.provider === 'xai').connected, true);
  } finally { fp.restore() }
});

test('a record copied to another account cannot be opened', async () => {
  const env = makeEnv(); const fp = fakeProviders();
  try {
    const a = await signUp(env), b = await signUp(env);
    await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'openai', apiKey: GOOD } });
    const users = env.DB.raw.prepare('SELECT id FROM users').all().map(r => r.id); const bId = users.find(u => u !== env.DB.raw.prepare('SELECT user_id FROM keys').get().user_id);
    const row = env.DB.raw.prepare('SELECT * FROM keys').get();
    env.DB.raw.prepare('INSERT INTO keys (user_id, provider, ct, iv, kv, created) VALUES (?, ?, ?, ?, ?, ?)').run(bId, 'openai', row.ct, row.iv, row.kv, row.created);
    const r = await call(env, 'POST', '/v1/openai/chat/completions', { token: b.token, body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] } });
    assert.equal(r.status, 500); assert.equal(r.data.error.code, 'unseal_failed');
  } finally { fp.restore() }
});

test('no credit, rate limits, daily cap and sign-out', async () => {
  const env = makeEnv(); const fp = fakeProviders();
  try {
    const a = await signUp(env);
    const nc = await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'openai', apiKey: 'sk-test-NOCREDIT000000000000' } });
    assert.equal(nc.status, 402); assert.match(nc.data.error.message, /no credit|billing/);
    await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'openai', apiKey: GOOD } });
    let limited = 0;
    for (let i = 0; i < 25; i++) { const r = await call(env, 'POST', '/v1/openai/chat/completions', { token: a.token, body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] } }); if (r.status === 429) limited++ }
    assert.ok(limited >= 4, 'per-minute limit kicks in');
    env.DB.raw.prepare("UPDATE usage SET requests = 600").run(); env.DB.raw.prepare('DELETE FROM rl').run();
    const cap = await call(env, 'POST', '/v1/openai/chat/completions', { token: a.token, body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] } });
    assert.equal(cap.status, 429); assert.equal(cap.data.error.code, 'daily_limit');
    assert.equal((await call(env, 'POST', '/api/logout', { token: a.token })).status, 200);
    assert.equal((await call(env, 'GET', '/api/credentials', { token: a.token })).status, 401);
  } finally { fp.restore() }
});

test('expired sessions are refused and deleting the account removes everything', async () => {
  const env = makeEnv(); const fp = fakeProviders();
  try {
    const a = await signUp(env);
    await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'openai', apiKey: GOOD } });
    assert.equal((await call(env, 'DELETE', '/api/account', { token: a.token })).status, 200);
    for (const t of ['users', 'passkeys', 'keys', 'sessions']) assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, t);
    const b = await signUp(env); env.DB.raw.prepare('UPDATE sessions SET expires = 1').run();
    assert.equal((await call(env, 'GET', '/api/credentials', { token: b.token })).status, 401);
  } finally { fp.restore() }
});

test('without its sealing secret the vault refuses to store keys', async () => {
  const env = makeEnv({ VAULT_KEY: '' }); const fp = fakeProviders();
  try {
    const a = await signUp(env);
    const r = await call(env, 'POST', '/api/credentials', { token: a.token, body: { provider: 'openai', apiKey: GOOD } });
    assert.equal(r.status, 500); assert.equal(r.data.error.code, 'not_configured');
    assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM keys').get().n, 0);
  } finally { fp.restore() }
});
