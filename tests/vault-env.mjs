// Test kit for worker/vault.js: a D1 stand-in on node:sqlite, a software passkey (like a phone's), and fake AI providers.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { webcrypto as wc } from 'node:crypto';
import vault, { b64u } from '../worker/vault.js';

// D1 uses ?1 ?2 numbered params which may repeat (?3 used twice in the upsert). Rewrite to positional args.
function numbered(db) {
  return { prepare(sql) {
    const order = [...sql.matchAll(/\?(\d+)/g)].map(m => Number(m[1]) - 1), q = sql.replace(/\?\d+/g, '?');
    const wrap = (args = []) => { const a = order.map(i => args[i]); return {
      bind: (...x) => wrap(x),
      first: async () => db.prepare(q).get(...a) ?? null,
      all: async () => ({ results: db.prepare(q).all(...a) }),
      run: async () => { db.prepare(q).run(...a); return { success: true } } } };
    return wrap();
  }, raw: db };
}
export function makeEnv(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/vault-schema.sql', import.meta.url), 'utf8'));
  return { DB: numbered(db), VAULT_KEY: Buffer.from(wc.getRandomValues(new Uint8Array(32))).toString('base64'), RP_ID: 'myechovision.com', ORIGINS: 'https://myechovision.com', ...extra };
}

export const ORIGIN = 'https://myechovision.com';
export async function call(env, method, path, { token, body, origin = ORIGIN, headers = {} } = {}) {
  const h = { ...headers }; if (origin) h.Origin = origin; if (token) h.Authorization = 'Bearer ' + token; if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await vault.fetch(new Request('https://vault.test' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  const text = await r.text(); let data = null; try { data = JSON.parse(text) } catch { data = text }
  return { status: r.status, data, headers: r.headers, text };
}

// A software passkey: makes an ES256 key pair, answers create/get the way a phone would.
const enc = new TextEncoder();
const sha = async b => new Uint8Array(await wc.subtle.digest('SHA-256', b));
function rawToDer(raw) {
  const part = b => { let v = b; while (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) v = v.slice(1); if (v[0] & 0x80) v = Uint8Array.from([0, ...v]); return [0x02, v.length, ...v] };
  const body = [...part(raw.slice(0, 32)), ...part(raw.slice(32))]; return Uint8Array.from([0x30, body.length, ...body]);
}
export class Phone {
  constructor({ rpId = 'myechovision.com', origin = ORIGIN, uv = true } = {}) { this.rpId = rpId; this.origin = origin; this.uv = uv; this.count = 0 }
  async authData() { const flags = 0x01 | (this.uv ? 0x04 : 0) | 0x40 * 0; const c = new Uint8Array(4); new DataView(c.buffer).setUint32(0, this.count); return Uint8Array.from([...await sha(enc.encode(this.rpId)), flags, ...c]) }
  async create(opts) {
    this.keys = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    this.id = b64u.from(wc.getRandomValues(new Uint8Array(20)));
    const client = enc.encode(JSON.stringify({ type: 'webauthn.create', challenge: opts.publicKey.challenge, origin: this.origin }));
    return { challengeId: opts.challengeId, id: this.id, clientDataJSON: b64u.from(client), authenticatorData: b64u.from(await this.authData()), publicKey: b64u.from(await wc.subtle.exportKey('spki', this.keys.publicKey)), alg: -7 };
  }
  async get(opts, { tamper = false } = {}) {
    this.count++;
    const client = enc.encode(JSON.stringify({ type: 'webauthn.get', challenge: opts.publicKey.challenge, origin: this.origin }));
    const ad = await this.authData(); const signed = Uint8Array.from([...ad, ...await sha(client)]);
    const raw = new Uint8Array(await wc.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.keys.privateKey, signed)); if (tamper) raw[5] ^= 1;
    return { challengeId: opts.challengeId, id: this.id, clientDataJSON: b64u.from(client), authenticatorData: b64u.from(ad), signature: b64u.from(rawToDer(raw)) };
  }
}
export async function signUp(env, phone = new Phone()) {
  const s = await call(env, 'POST', '/api/passkey/register/start');
  const f = await call(env, 'POST', '/api/passkey/register/finish', { body: await phone.create(s.data) });
  return { phone, token: f.data.token, res: f };
}

// Fake providers: remember which key each request carried; good keys list models and answer chats.
export function fakeProviders(good = { openai: 'sk-test-GOOD0000000000000000', xai: 'xai-GOOD000000000000000000' }) {
  const seen = []; const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), auth = (init.headers || {}).Authorization || '', key = auth.replace(/^Bearer /, '');
    seen.push({ url: u, key, body: init.body ? JSON.parse(init.body) : null });
    const prov = u.includes('api.openai.com') ? 'openai' : u.includes('api.x.ai') ? 'xai' : u.includes('groq.com') ? 'groq' : u.includes('openrouter') ? 'openrouter' : null;
    if (!prov) return real(url, init);
    if (key === 'sk-test-NOCREDIT000000000000') return new Response(JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota' } }), { status: 429 });
    if (key !== good[prov]) return new Response(JSON.stringify({ error: { message: 'Incorrect API key provided: ' + key } }), { status: 401 });
    if (u.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1' }, { id: 'whisper-1' }, { id: 'tts-1' }, { id: 'grok-4-fast-non-reasoning' }, { id: 'text-embedding-3-small' }] }));
    if (u.endsWith('/chat/completions')) return new Response('data: {"choices":[{"delta":{"content":"Hello from the fake model."}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    return new Response('nope', { status: 404 });
  };
  return { seen, restore: () => { globalThis.fetch = real } };
}
