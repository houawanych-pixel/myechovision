// My Echo Vision key vault — a Cloudflare Worker.
//
// Each person signs in with a passkey (their phone's fingerprint or screen lock; no password, no email). They can save
// their own AI key (OpenAI, Grok/xAI, Groq, OpenRouter). The key is sealed with AES-256-GCM using a secret that only
// this Worker holds, stored in D1, and never sent back to any browser. Chat requests come here with the person's
// session token; the Worker opens their key for that one request, calls the provider, and streams the answer back.
//
// Bindings (see worker/wrangler.vault.toml):
//   DB         D1 database (schema: worker/vault-schema.sql)
//   VAULT_KEY  secret: base64 of 32 random bytes (the sealing key). Never commit it.
//   RP_ID      the site's domain for passkeys, e.g. "myechovision.com"
//   ORIGINS    comma-separated pages allowed to call this Worker, e.g. "https://myechovision.com"
//
// Routes:
//   GET  /api/health
//   POST /api/passkey/register/start | /api/passkey/register/finish
//   POST /api/passkey/login/start    | /api/passkey/login/finish
//   POST /api/logout                  DELETE /api/account
//   GET  /api/credentials             POST /api/credentials {provider, apiKey}     DELETE /api/credentials/:provider
//   GET  /api/usage
//   GET  /v1/:provider/models         POST /v1/:provider/chat/completions   (OpenAI-compatible, for the app's brain)

const VERSION = 'vault-1';
const SESSION_DAYS = 30;
const LIMITS = { perMinute: 20, perDay: 600, authPerMinute: 30, maxBody: 2_000_000, maxTokens: 2000, maxMessages: 80, maxChars: 40_000, timeoutMs: 60_000 };

export const PROVIDERS = {
  openai: { name: 'OpenAI GPT', base: 'https://api.openai.com/v1', key: /^sk-[A-Za-z0-9_\-]{16,}$/, model: id => /^(gpt-|o\d|chatgpt)/i.test(id) && !/audio|realtime|tts|transcribe|image|search|instruct|embedding|moderation|dall|whisper|codex|computer-use/i.test(id) },
  xai: { name: 'Grok (xAI)', base: 'https://api.x.ai/v1', key: /^xai-[A-Za-z0-9_\-]{16,}$/, model: id => /^grok/i.test(id) && !/image|vision-beta|imagine/i.test(id) },
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', key: /^gsk_[A-Za-z0-9]{16,}$/, model: id => !/whisper|tts|guard|playai|orpheus|embed|distil|compound/i.test(id) },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', key: /^sk-or-[A-Za-z0-9_\-]{16,}$/, model: id => /^[a-z0-9\-_.]+\/[a-z0-9\-_.:]+$/i.test(id) && !/embed|tts|whisper|image|audio/i.test(id) },
};

// ---------- small helpers ----------
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64u = {
  from(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') },
  to(str) { const s = String(str).replace(/-/g, '+').replace(/_/g, '/'); const p = s + '='.repeat((4 - s.length % 4) % 4); const bin = atob(p); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out },
};
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async data => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const now = () => Math.floor(Date.now() / 1000);
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0 };

class Fail extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code || 'error' } }

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = allowedOrigins(env);
  const h = { 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  if (allowed.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
  return h;
}
const allowedOrigins = env => String(env.ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
function json(req, env, data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req, env) } }) }
async function body(req, max = 64_000) {
  const len = Number(req.headers.get('Content-Length') || 0); if (len > max) throw new Fail(413, 'That request is too large.', 'too_large');
  const t = await req.text(); if (t.length > max) throw new Fail(413, 'That request is too large.', 'too_large');
  try { return t ? JSON.parse(t) : {} } catch { throw new Fail(400, 'That request was not valid JSON.', 'bad_json') }
}

// ---------- rate limits (fixed one-minute windows in D1) ----------
async function bump(env, key, limit, windowSec = 60) {
  const w = Math.floor(now() / windowSec), k = `${key}:${w}`, exp = (w + 2) * windowSec;
  await env.DB.prepare('INSERT INTO rl (k, n, expires) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1').bind(k, exp).run();
  const row = await env.DB.prepare('SELECT n FROM rl WHERE k = ?1').bind(k).first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rl WHERE expires < ?1').bind(now()).run();
  if (row && row.n > limit) throw new Fail(429, 'Too many requests. Please wait a minute and try again.', 'rate_limited');
}
async function ipKey(req) { return 'ip:' + hex(await sha256('ip|' + (req.headers.get('CF-Connecting-IP') || 'local'))).slice(0, 24) }

// ---------- sessions ----------
async function newSession(env, userId) {
  const token = b64u.from(rand(32));
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?1, ?2, ?3)').bind(hex(await sha256(token)), userId, now() + SESSION_DAYS * 86400).run();
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM sessions WHERE expires < ?1').bind(now()).run();
  return token;
}
async function who(req, env) {
  const m = /^Bearer ([A-Za-z0-9_\-]{20,100})$/.exec(req.headers.get('Authorization') || '');
  if (!m) throw new Fail(401, 'Please sign in first.', 'signed_out');
  const row = await env.DB.prepare('SELECT user_id, expires FROM sessions WHERE token_hash = ?1').bind(hex(await sha256(m[1]))).first();
  if (!row || row.expires < now()) throw new Fail(401, 'Your sign-in has ended. Please sign in again.', 'signed_out');
  return { userId: row.user_id, tokenHash: hex(await sha256(m[1])) };
}

// ---------- sealing keys (AES-256-GCM; the record is bound to its owner and provider) ----------
async function sealKey(env) {
  const raw = b64u.to(String(env.VAULT_KEY || '').replace(/=+$/, ''));
  if (raw.length !== 32) throw new Fail(500, 'The vault is not set up yet.', 'not_configured');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, userId, provider, secret) {
  const iv = rand(12), k = await sealKey(env);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${userId}|${provider}|1`) }, k, enc.encode(secret));
  return { ct: b64u.from(ct), iv: b64u.from(iv), kv: 1 };
}
async function open(env, userId, provider) {
  const row = await env.DB.prepare('SELECT ct, iv, kv FROM keys WHERE user_id = ?1 AND provider = ?2').bind(userId, provider).first();
  if (!row) throw new Fail(404, `No ${PROVIDERS[provider].name} key is saved. Connect one in the AI brain panel.`, 'no_key');
  const k = await sealKey(env);
  try { return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.to(row.iv), additionalData: enc.encode(`${userId}|${provider}|${row.kv}`) }, k, b64u.to(row.ct))) }
  catch { throw new Fail(500, 'Your saved key could not be opened. Please connect it again.', 'unseal_failed') }
}

// ---------- passkeys (WebAuthn, verified here with WebCrypto) ----------
async function challenge(env, kind, userId = null) {
  const id = b64u.from(rand(16)), ch = b64u.from(rand(32));
  await env.DB.prepare('INSERT INTO challenges (id, challenge, kind, user_id, expires) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, ch, kind, userId, now() + 300).run();
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM challenges WHERE expires < ?1').bind(now()).run();
  return { id, ch };
}
async function takeChallenge(env, id, kind) {
  const row = await env.DB.prepare('SELECT challenge, kind, user_id, expires FROM challenges WHERE id = ?1').bind(String(id || '')).first();
  await env.DB.prepare('DELETE FROM challenges WHERE id = ?1').bind(String(id || '')).run();
  if (!row || row.kind !== kind || row.expires < now()) throw new Fail(400, 'That sign-in attempt expired. Please try again.', 'challenge');
  return row;
}
function checkClient(env, clientDataJSON, type, expected) {
  let c; try { c = JSON.parse(dec.decode(b64u.to(clientDataJSON))) } catch { throw new Fail(400, 'Passkey data was not readable.', 'passkey') }
  if (c.type !== type) throw new Fail(400, 'Passkey data was for the wrong step.', 'passkey');
  if (c.challenge !== expected) throw new Fail(400, 'That passkey answer did not match. Please try again.', 'passkey');
  if (!allowedOrigins(env).includes(c.origin)) throw new Fail(403, 'Passkeys only work on the My Echo Vision site.', 'origin');
}
async function checkAuthData(env, authData) {
  if (authData.length < 37) throw new Fail(400, 'Passkey data was too short.', 'passkey');
  const rpHash = await sha256(String(env.RP_ID || ''));
  if (!same(authData.slice(0, 32), rpHash)) throw new Fail(403, 'That passkey belongs to a different site.', 'passkey');
  const flags = authData[32];
  if (!(flags & 0x01)) throw new Fail(400, 'Your device did not confirm you were present.', 'passkey');
  if (!(flags & 0x04)) throw new Fail(400, 'Your device did not check your fingerprint or screen lock.', 'passkey');
  return { signCount: new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0) };
}
function derToRaw(der) {   // ECDSA signature: DER SEQUENCE{r,s} -> 64-byte r||s for WebCrypto
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => { if (der[i++] !== 0x02) throw new Fail(400, 'Passkey signature was not readable.', 'passkey'); const len = der[i++]; let v = der.slice(i, i + len); i += len; while (v.length > 32 && v[0] === 0) v = v.slice(1); const out = new Uint8Array(32); out.set(v, 32 - v.length); return out };
  const r = read(), s = read(), raw = new Uint8Array(64); raw.set(r); raw.set(s, 32); return raw;
}
async function importPub(spki, alg) {
  if (alg === -7) return crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (alg === -257) return crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  throw new Fail(400, 'This passkey type is not supported.', 'passkey');
}

async function registerStart(req, env) {
  await bump(env, await ipKey(req), LIMITS.authPerMinute);
  const userId = b64u.from(rand(16)), { id, ch } = await challenge(env, 'reg', userId);
  return json(req, env, { challengeId: id, publicKey: {
    challenge: ch, rp: { id: env.RP_ID, name: 'My Echo Vision' },
    user: { id: userId, name: 'Echo Vision ' + new Date().toISOString().slice(0, 10), displayName: 'My Echo Vision' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    attestation: 'none', timeout: 120000 } });
}
async function registerFinish(req, env) {
  await bump(env, await ipKey(req), LIMITS.authPerMinute);
  const b = await body(req), row = await takeChallenge(env, b.challengeId, 'reg');
  checkClient(env, b.clientDataJSON, 'webauthn.create', row.challenge);
  const authData = b64u.to(b.authenticatorData || ''), { signCount } = await checkAuthData(env, authData);
  const alg = Number(b.alg), spki = b64u.to(b.publicKey || '');
  await importPub(spki, alg);   // throws if the key is not a valid public key of that type
  const credId = String(b.id || ''); if (!/^[A-Za-z0-9_\-]{16,512}$/.test(credId)) throw new Fail(400, 'Passkey id was not valid.', 'passkey');
  if (await env.DB.prepare('SELECT 1 FROM passkeys WHERE cred_id = ?1').bind(credId).first()) throw new Fail(409, 'That passkey is already registered. Use Sign in.', 'exists');
  await env.DB.prepare('INSERT INTO users (id, created) VALUES (?1, ?2)').bind(row.user_id, now()).run();
  await env.DB.prepare('INSERT INTO passkeys (cred_id, user_id, spki, alg, sign_count, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(credId, row.user_id, b64u.from(spki), alg, signCount, now()).run();
  return json(req, env, { token: await newSession(env, row.user_id), created: true });
}
async function loginStart(req, env) {
  await bump(env, await ipKey(req), LIMITS.authPerMinute);
  const { id, ch } = await challenge(env, 'auth');
  return json(req, env, { challengeId: id, publicKey: { challenge: ch, rpId: env.RP_ID, userVerification: 'required', timeout: 120000 } });
}
async function loginFinish(req, env) {
  await bump(env, await ipKey(req), LIMITS.authPerMinute);
  const b = await body(req), row = await takeChallenge(env, b.challengeId, 'auth');
  const pk = await env.DB.prepare('SELECT user_id, spki, alg, sign_count FROM passkeys WHERE cred_id = ?1').bind(String(b.id || '')).first();
  if (!pk) throw new Fail(404, 'That passkey is not known here. Create a new sign-in instead.', 'unknown_passkey');
  checkClient(env, b.clientDataJSON, 'webauthn.get', row.challenge);
  const authData = b64u.to(b.authenticatorData || ''), { signCount } = await checkAuthData(env, authData);
  const signed = new Uint8Array([...authData, ...await sha256(b64u.to(b.clientDataJSON))]);
  const key = await importPub(b64u.to(pk.spki), pk.alg);
  const sig = b64u.to(b.signature || '');
  const ok = pk.alg === -7 ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig), signed) : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
  if (!ok) throw new Fail(401, 'The passkey signature did not check out.', 'bad_signature');
  if (pk.sign_count > 0 && signCount > 0 && signCount <= pk.sign_count) throw new Fail(401, 'This passkey looks copied. Sign-in blocked for safety.', 'counter');
  await env.DB.prepare('UPDATE passkeys SET sign_count = ?1 WHERE cred_id = ?2').bind(signCount, String(b.id)).run();
  return json(req, env, { token: await newSession(env, pk.user_id) });
}

// ---------- provider calls ----------
async function providerError(r) {
  let detail = ''; try { const t = await r.text(); try { const j = JSON.parse(t); detail = j.error?.message || j.message || (typeof j.error === 'string' ? j.error : '') || '' } catch { detail = t } } catch { }
  detail = String(detail).replace(/(sk|xai|gsk)[-_][A-Za-z0-9_\-]{6,}/g, '[key]').replace(/\s+/g, ' ').trim().slice(0, 200);
  const low = detail.toLowerCase();
  if (r.status === 401 || r.status === 403) return new Fail(401, 'The provider did not accept this key. It may be wrong, expired or revoked. Connect a new key.', 'key_rejected');
  if (r.status === 402 || /insufficient_quota|billing|credit|payment|quota/.test(low)) return new Fail(402, 'Your provider account has no credit or billing is not set up. Add credit on the provider’s site.', 'no_credit');
  if (r.status === 429) return new Fail(429, 'The provider is rate-limiting your account. Wait a moment and try again.', 'provider_rate_limited');
  if (r.status === 404) return new Fail(404, 'The provider does not offer that model to your account. Choose another model.', 'model_missing');
  if (r.status === 400 || r.status === 422) return new Fail(400, detail ? `The provider refused the request: ${detail}` : 'The provider refused the request.', 'provider_refused');
  return new Fail(502, `The provider answered with error ${r.status}. Try again shortly.`, 'provider_error');
}
async function call(provider, key, path, init = {}) {
  let r;
  try { r = await fetch(PROVIDERS[provider].base + path, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(LIMITS.timeoutMs) }) }
  catch (e) { throw new Fail(504, e?.name === 'TimeoutError' ? 'The provider took too long to answer.' : 'Could not reach the provider.', 'provider_unreachable') }
  if (!r.ok) throw await providerError(r);
  return r;
}
async function listModels(provider, key) {
  const d = await (await call(provider, key, '/models')).json();
  return (d.data || d.models || []).map(m => m.id || m.name).filter(Boolean).filter(PROVIDERS[provider].model).sort();
}
const providerOf = p => { if (!Object.hasOwn(PROVIDERS, p)) throw new Fail(400, 'That AI service is not supported.', 'provider'); return p };

// ---------- account and saved keys ----------
async function credentialsGet(req, env) {
  const { userId } = await who(req, env);
  const rows = (await env.DB.prepare('SELECT provider, created FROM keys WHERE user_id = ?1').bind(userId).all()).results || [];
  return json(req, env, { signedIn: true, providers: Object.keys(PROVIDERS).map(p => { const r = rows.find(x => x.provider === p); return { provider: p, name: PROVIDERS[p].name, connected: !!r, since: r?.created || null } }) });
}
async function credentialsPost(req, env) {
  const { userId } = await who(req, env);
  await bump(env, 'min:' + userId, LIMITS.perMinute);
  const b = await body(req, 4000), provider = providerOf(b.provider), apiKey = String(b.apiKey || '').trim();
  if (!PROVIDERS[provider].key.test(apiKey) || apiKey.length > 300) throw new Fail(400, `That does not look like a ${PROVIDERS[provider].name} key. Copy the whole key from the provider’s key page.`, 'key_format');
  const models = await listModels(provider, apiKey);   // proves the key works before anything is saved
  const s = await seal(env, userId, provider, apiKey);
  await env.DB.prepare('INSERT INTO keys (user_id, provider, ct, iv, kv, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(user_id, provider) DO UPDATE SET ct = ?3, iv = ?4, kv = ?5, created = ?6').bind(userId, provider, s.ct, s.iv, s.kv, now()).run();
  return json(req, env, { connected: true, provider, models });
}
async function credentialsDelete(req, env, provider) {
  const { userId } = await who(req, env); providerOf(provider);
  await env.DB.prepare('DELETE FROM keys WHERE user_id = ?1 AND provider = ?2').bind(userId, provider).run();
  return json(req, env, { connected: false, provider });
}
async function logout(req, env) { const { tokenHash } = await who(req, env); await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run(); return json(req, env, { signedOut: true }) }
async function accountDelete(req, env) {
  const { userId } = await who(req, env);
  for (const t of ['keys', 'sessions', 'passkeys', 'usage']) await env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(userId).run();
  await env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(userId).run();
  return json(req, env, { deleted: true });
}
async function usageGet(req, env) {
  const { userId } = await who(req, env);
  const rows = (await env.DB.prepare('SELECT day, provider, requests FROM usage WHERE user_id = ?1 ORDER BY day DESC LIMIT 60').bind(userId).all()).results || [];
  return json(req, env, { usage: rows, limits: { perMinute: LIMITS.perMinute, perDay: LIMITS.perDay, maxTokens: LIMITS.maxTokens } });
}

// ---------- the OpenAI-compatible brain endpoints ----------
async function modelsGet(req, env, provider) {
  const { userId } = await who(req, env); providerOf(provider);
  await bump(env, 'min:' + userId, LIMITS.perMinute);
  const ids = await listModels(provider, await open(env, userId, provider));
  return json(req, env, { object: 'list', data: ids.map(id => ({ id, object: 'model' })) });
}
function cleanChat(provider, b) {
  const model = String(b.model || '');
  if (!model || model.length > 120 || !PROVIDERS[provider].model(model)) throw new Fail(400, 'That model is not allowed here. Choose a chat model.', 'model_not_allowed');
  if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > LIMITS.maxMessages) throw new Fail(400, 'The conversation was empty or too long.', 'messages');
  let chars = 0;
  const messages = b.messages.map(m => {
    const role = ['system', 'user', 'assistant'].includes(m?.role) ? m.role : null; if (!role) throw new Fail(400, 'A message had an unknown role.', 'messages');
    if (typeof m.content === 'string') { chars += m.content.length; return { role, content: m.content } }
    if (Array.isArray(m.content)) return { role, content: m.content.slice(0, 4).map(p => { if (p?.type === 'text') { chars += String(p.text || '').length; return { type: 'text', text: String(p.text || '') } } if (p?.type === 'image_url' && /^data:image\/(jpeg|png|webp);base64,/.test(p.image_url?.url || '')) return { type: 'image_url', image_url: { url: p.image_url.url } }; throw new Fail(400, 'A message part was not allowed.', 'messages') }) };
    throw new Fail(400, 'A message was not readable.', 'messages');
  });
  if (chars > LIMITS.maxChars) throw new Fail(413, 'The conversation is too long to send in one go.', 'too_long');
  const out = { model, messages, stream: !!b.stream, max_tokens: Math.max(1, Math.min(LIMITS.maxTokens, Number(b.max_tokens) || 300)) };
  for (const k of ['temperature', 'top_p']) if (typeof b[k] === 'number' && isFinite(b[k])) out[k] = Math.max(0, Math.min(2, b[k]));
  if (['none', 'minimal', 'low', 'medium'].includes(b.reasoning_effort)) out.reasoning_effort = b.reasoning_effort;
  if (provider === 'openai' && /^(o\d|gpt-5)/i.test(model)) { out.max_completion_tokens = out.max_tokens; delete out.max_tokens; delete out.temperature; delete out.top_p }
  return out;
}
async function chat(req, env, provider) {
  const { userId } = await who(req, env); providerOf(provider);
  await bump(env, 'min:' + userId, LIMITS.perMinute);
  const day = new Date().toISOString().slice(0, 10);
  const used = await env.DB.prepare('SELECT COALESCE(SUM(requests), 0) AS n FROM usage WHERE user_id = ?1 AND day = ?2').bind(userId, day).first();
  if ((used?.n || 0) >= LIMITS.perDay) throw new Fail(429, `You reached today's limit of ${LIMITS.perDay} replies through My Echo Vision. It resets at midnight UTC.`, 'daily_limit');
  const payload = cleanChat(provider, await body(req, LIMITS.maxBody));
  const key = await open(env, userId, provider);
  const r = await call(provider, key, '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  await env.DB.prepare('INSERT INTO usage (user_id, day, provider, requests) VALUES (?1, ?2, ?3, 1) ON CONFLICT(user_id, day, provider) DO UPDATE SET requests = requests + 1').bind(userId, day, provider).run();
  return new Response(r.body, { status: 200, headers: { 'Content-Type': r.headers.get('Content-Type') || (payload.stream ? 'text/event-stream' : 'application/json'), ...corsHeaders(req, env) } });
}

// ---------- router ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: allowedOrigins(env).includes(origin || '') ? 204 : 403, headers: corsHeaders(req, env) });
    try {
      // CORS is not authentication (every call below checks the sign-in), but a browser page from another site is refused outright.
      if (origin && !allowedOrigins(env).includes(origin)) throw new Fail(403, 'This site is not allowed to use the vault.', 'origin');
      if (path === '/api/health' && req.method === 'GET') return json(req, env, { ok: true, version: VERSION, providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.name])), configured: !!env.VAULT_KEY && !!env.RP_ID && !!env.DB });
      if (req.method === 'POST' && path === '/api/passkey/register/start') return await registerStart(req, env);
      if (req.method === 'POST' && path === '/api/passkey/register/finish') return await registerFinish(req, env);
      if (req.method === 'POST' && path === '/api/passkey/login/start') return await loginStart(req, env);
      if (req.method === 'POST' && path === '/api/passkey/login/finish') return await loginFinish(req, env);
      if (req.method === 'POST' && path === '/api/logout') return await logout(req, env);
      if (req.method === 'DELETE' && path === '/api/account') return await accountDelete(req, env);
      if (req.method === 'GET' && path === '/api/credentials') return await credentialsGet(req, env);
      if (req.method === 'POST' && path === '/api/credentials') return await credentialsPost(req, env);
      if (req.method === 'GET' && path === '/api/usage') return await usageGet(req, env);
      let m;
      if (req.method === 'DELETE' && (m = /^\/api\/credentials\/([a-z]+)$/.exec(path))) return await credentialsDelete(req, env, m[1]);
      if (req.method === 'GET' && (m = /^\/v1\/([a-z]+)\/models$/.exec(path))) return await modelsGet(req, env, m[1]);
      if (req.method === 'POST' && (m = /^\/v1\/([a-z]+)\/chat\/completions$/.exec(path))) return await chat(req, env, m[1]);
      throw new Fail(404, 'Not found.', 'not_found');
    } catch (e) {
      if (e instanceof Fail) return json(req, env, { error: { message: e.message, code: e.code } }, e.status);
      return json(req, env, { error: { message: 'Something went wrong in the vault.', code: 'internal' } }, 500);   // never echo internals (could contain request data)
    }
  },
};
