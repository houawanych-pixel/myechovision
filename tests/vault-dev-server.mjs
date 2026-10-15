// Runs worker/vault.js locally on Node for browser tests: D1 on node:sqlite, fake AI providers.
// node tests/vault-dev-server.mjs 8787 http://localhost:8765
import http from 'node:http';
import vault from '../worker/vault.js';
import { makeEnv, fakeProviders } from './vault-env.mjs';
const port = Number(process.argv[2] || 8787), origin = process.argv[3] || 'http://localhost:8765';
const env = makeEnv({ RP_ID: new URL(origin).hostname, ORIGINS: origin });
const fp = fakeProviders();
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await vault.fetch(new Request('http://localhost:' + port + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
  if (req.url.startsWith('/__seen')) {}
}).listen(port, () => console.log('vault dev on', port));
process.on('SIGTERM', () => { fp.restore(); process.exit(0) });
