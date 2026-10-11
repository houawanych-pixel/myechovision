// Optional Cloudflare Worker that keeps the model key on a server instead of in a browser.
// Use it before letting other people use Echo Vision: they then need no key of their own.
//
// Set these in the Worker's settings (Variables and Secrets):
//   UPSTREAM  e.g. https://api.groq.com/openai/v1   (any OpenAI-compatible service)
//   API_KEY   the service key, stored as a Secret
//   ALLOW     the site allowed to call this, e.g. https://houawanych-pixel.github.io
// Then in Echo Vision choose "My own server or computer", enter this Worker's address,
// leave the key empty, and tap "Check and list models".
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW || '',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.ALLOW || origin !== env.ALLOW) return new Response('Not allowed', { status: 403, headers: cors });
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const isModels = request.method === 'GET' && path.endsWith('/models');
    const isChat = request.method === 'POST' && path.endsWith('/chat/completions');
    if (!isModels && !isChat) return new Response('Not found', { status: 404, headers: cors });
    let body;
    if (isChat) {
      const text = await request.text();
      if (text.length > 60000) return new Response('Too large', { status: 413, headers: cors });
      const json = JSON.parse(text);
      json.max_tokens = Math.min(json.max_tokens || 200, 400); // keep replies short and costs predictable
      body = JSON.stringify(json);
    }
    const upstream = await fetch(env.UPSTREAM.replace(/\/+$/, '') + (isModels ? '/models' : '/chat/completions'), {
      method: request.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.API_KEY}` },
      body,
    });
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
