// Client for the key vault (worker/vault.js). People sign in with a passkey (fingerprint or screen lock).
// Their AI key is sent once, over HTTPS, to the vault and is never stored in this browser or sent back.
// What this browser keeps: only a sign-in token for the vault (not an AI key), in localStorage.
const TOKEN = 'echo-vault-session';
let cfg = null, health = null;
export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI GPT', keyPage: 'https://platform.openai.com/api-keys', hint: 'starts with sk-' },
  { id: 'xai', name: 'Grok (xAI)', keyPage: 'https://console.x.ai', hint: 'starts with xai-' },
  { id: 'groq', name: 'Groq', keyPage: 'https://console.groq.com/keys', hint: 'starts with gsk_' },
  { id: 'openrouter', name: 'OpenRouter', keyPage: 'https://openrouter.ai/settings/keys', hint: 'starts with sk-or-' },
];
const b64u = {
  from(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') },
  to(str) { const s = String(str).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out },
};
export async function config() {
  if (cfg) return cfg;
  try { const r = await fetch('vault.json', { cache: 'no-cache' }); cfg = r.ok ? await r.json() : {} } catch { cfg = {} }
  cfg.url = String(cfg.url || '').replace(/\/+$/, ''); return cfg;
}
export const base = () => cfg?.url || '';
await config();   // loaded before anything asks whether an address belongs to the vault
// Is the secure vault deployed and reachable? Until it is, the app does not offer to take keys.
export async function available() {
  if (health !== null) return health;
  const c = await config(); if (!c.url) return health = false;
  if (!window.PublicKeyCredential || !navigator.credentials?.create) return health = false;
  try { const r = await fetch(c.url + '/api/health', { cache: 'no-store' }); const d = r.ok ? await r.json() : null; return health = !!(d?.ok && d.configured) } catch { return health = false }
}
export function token() { try { return localStorage.getItem(TOKEN) || '' } catch { return '' } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN) } catch { } }
export const signedIn = () => !!token();
export const isVaultUrl = u => !!base() && String(u || '').startsWith(base() + '/v1/');
export const brainUrl = provider => base() + '/v1/' + provider;
async function api(method, path, body, auth = true) {
  await config();
  const h = {}; if (body !== undefined) h['Content-Type'] = 'application/json'; if (auth) { if (!token()) throw Object.assign(Error('Please sign in first.'), { code: 'signed_out' }); h.Authorization = 'Bearer ' + token() }
  let r; try { r = await fetch(base() + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }) } catch { throw Error('Could not reach the secure vault. Check your connection.') }
  let d = null; try { d = await r.json() } catch { }
  if (!r.ok) { if (r.status === 401 && d?.error?.code === 'signed_out') setToken(''); throw Object.assign(Error(d?.error?.message || `The vault answered with error ${r.status}.`), { code: d?.error?.code, status: r.status }) }
  return d;
}
// Sign in with this device's passkey; if there is none for this site yet, make one (that is the new account).
export async function signIn({ create = false } = {}) {
  if (!create) {
    try {
      const s = await api('POST', '/api/passkey/login/start', {}, false), pk = s.publicKey;
      const cred = await navigator.credentials.get({ publicKey: { challenge: b64u.to(pk.challenge), rpId: pk.rpId, userVerification: pk.userVerification, timeout: pk.timeout } });
      if (!cred) throw Error('cancelled');
      const r = cred.response;
      const d = await api('POST', '/api/passkey/login/finish', { challengeId: s.challengeId, id: cred.id, clientDataJSON: b64u.from(r.clientDataJSON), authenticatorData: b64u.from(r.authenticatorData), signature: b64u.from(r.signature), userHandle: r.userHandle ? b64u.from(r.userHandle) : null }, false);
      setToken(d.token); return { created: false };
    } catch (e) {
      if (e.code === 'unknown_passkey') throw Error('That passkey is no longer known here. Choose “Create my sign-in” to make a new one.');
      if (e.name === 'NotAllowedError' || e.message === 'cancelled') throw Object.assign(Error('No passkey was used. If this is your first time, choose “Create my sign-in”.'), { code: 'no_passkey' });
      throw e;
    }
  }
  const s = await api('POST', '/api/passkey/register/start', {}, false), pk = s.publicKey;
  let cred;
  try { cred = await navigator.credentials.create({ publicKey: { ...pk, challenge: b64u.to(pk.challenge), user: { ...pk.user, id: b64u.to(pk.user.id) } } }) }
  catch (e) { throw Error(e.name === 'NotAllowedError' ? 'The passkey was cancelled.' : 'This device could not make a passkey.') }
  const r = cred.response;
  if (!r.getPublicKey || !r.getAuthenticatorData) throw Error('This browser is too old for passkeys here. Update Chrome or Safari.');
  const d = await api('POST', '/api/passkey/register/finish', { challengeId: s.challengeId, id: cred.id, clientDataJSON: b64u.from(r.clientDataJSON), authenticatorData: b64u.from(r.getAuthenticatorData()), publicKey: b64u.from(r.getPublicKey()), alg: r.getPublicKeyAlgorithm() }, false);
  setToken(d.token); return { created: true };
}
export async function signOut() { try { await api('POST', '/api/logout', {}) } catch { } setToken('') }
export const status = () => api('GET', '/api/credentials');
export const usage = () => api('GET', '/api/usage');
export const connect = (provider, apiKey) => api('POST', '/api/credentials', { provider, apiKey });
export const disconnect = provider => api('DELETE', '/api/credentials/' + provider);
export const deleteAccount = async () => { await api('DELETE', '/api/account'); setToken('') };
