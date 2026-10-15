# Echo Vision: secure bring-your-own-key brain integration

Status: **design / implementation checklist, not deployed.** Do not ask users to enter paid API keys into the current browser-only key field until the secure flow is launched and tested.

## Existing implementation reviewed (2026-10-15)

- `app/brain.mjs` uses `localStorage` key `echo-vision-brain-key` and sends `Authorization: Bearer ...` from the browser directly to remote AI services. This is **not** secure at-rest storage; any same-origin malicious script can retrieve it.
- `app/app.js` has the "Give Judy a brain" service selector and key/password input. OpenAI GPT is now a selection alongside Grok, Groq, OpenRouter and a custom service.
- `worker/brain-proxy.js` is an **operator-owned single shared-key** proxy. It is NOT per-user BYOK and is NOT safe to expose publicly without authentication, throttling and abuse controls: CORS origin checking is not user authentication.
- `app/brain.json` configures an existing built-in Worker endpoint. Do not replace it or break its users during BYOK work.
- The local Llama / WebGPU choice does not require any API key and should remain unchanged.

## Target user flow

1. In the character chat, select **AI brain → change → OpenAI GPT → Connect my account**.
2. Open the official `https://platform.openai.com/api-keys` page in a separate tab to obtain a key; users enter secrets ONLY in the trusted Echo Vision connection form, never chat/GitHub.
3. Send the key once via HTTPS to an authenticated backend bound to the user's account. Never expose it in a URL, analytics event, log, exception, crash report or frontend persistence.
4. Server encrypts the key at rest with a server-side managed encryption key (Cloudflare secret / KMS), stores only ciphertext, authenticated user id, provider, and a non-sensitive key label. Never store plaintext after encryption.
5. The chat endpoint verifies the session, obtains the user's decrypted secret server-side, validates an allowlisted provider/model and response-token caps, forwards the chat request, and streams the response. No provider secret returns to the browser.
6. Provide **Test connection**, **Disconnect/revoke saved credential**, per-user usage visibility and a low spending/rate cap. Explain that deleting Echo Vision's copy does not revoke the key at OpenAI; that requires the OpenAI dashboard.
7. Preserve previously stored local data; migrate old browser keys only with user-initiated reentry. Never send or read the old key silently.

## Minimum backend/API contract

- `POST /api/credentials` (authenticated, CSRF-protected): `{provider:'openai',apiKey:'...'}`; returns `{connected:true,provider:'openai'}`; input length and provider format checked, response never echoes secret.
- `GET /api/credentials` (authenticated): provider connection statuses, **never** key.
- `DELETE /api/credentials/openai` (authenticated): removes ciphertext and derived session state.
- `GET /api/models?provider=openai` (authenticated): backend calls `https://api.openai.com/v1/models` using user's saved key and returns a filtered list of text chat models.
- `POST /api/chat` (authenticated): `{provider:'openai',model,messages}`; enforce body size, allowed models, token/usage caps, timeouts, rate limits; optionally stream SSE.
- Site CORS: restrict to actual Echo Vision origins, explicitly check origin for sensitive operations, and use session authentication + CSRF. CORS alone does not authorize requests.

## Build and deployment gates

- Pick hosting/auth/storage before creating endpoints: e.g. Cloudflare Worker + D1 + authenticated session + per-record AES-GCM encryption, encryption master key in Worker Secret, NOT in repository. Use rotated nonces and explicit key version. Check service plan and quotas.
- Frontend adapter must avoid `brain.setRemoteKey` / localStorage for OpenAI. Keep current Groq, Grok and local Llama behavior intact until separately migrated.
- Configure deployment secrets and allowed site origin out-of-band. Never commit API keys.
- Test: account isolation, fresh login/logout, wrong key, expired 7-day key, zero credits, missing API billing, 429s, network errors, disconnect, XSS review, mobile UI, voice-to-character reply streaming.
- Disable the new Connect control until its authenticated backend is actually deployed; otherwise show 'Secure connection coming soon' and link to the official key dashboard.
- **No live service or secret-storage system is configured by this document alone.**
