import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createWorkspace } from './server.mjs';

const MAX_STATE = 1_500_000;
const MAX_BODY = 1_500_000;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

function seal(bytes, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('caleane-browser-demo-v1'));
  const content = Buffer.concat([cipher.update(gzipSync(bytes)), cipher.final()]);
  if (content.length > MAX_STATE) fail(413, 'This sample workspace is full. Reset the demo to start again.');
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64url');
}

function open(state, key) {
  if (typeof state !== 'string' || state.length > MAX_STATE * 1.4 || !/^[\w-]+$/.test(state)) fail(400, 'This demo state is invalid. Reset the demo and try again.');
  try {
    const bytes = Buffer.from(state, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from('caleane-browser-demo-v1'));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const content = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    return gunzipSync(content, { maxOutputLength: 24_000_000 });
  } catch { fail(400, 'This demo state is invalid. Reset the demo and try again.'); }
}

// Run the actual workspace handler against a disposable, visitor-owned snapshot.
// No customer database or shared function filesystem state is used.
export async function runHostedDemo(input, { origin, key } = {}) {
  if (!Buffer.isBuffer(key) || key.length !== 32) fail(503, 'The demo is being configured. Please try again shortly.');
  if (!input || typeof input !== 'object') fail(400, 'Use a valid demo request.');
  const url = new URL(input.url || '', origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/') || url.pathname === '/api/demo' || !['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD'].includes(input.method)) fail(400, 'Use a valid workspace request.');
  const body = typeof input.body === 'string' ? input.body : '';
  if (Buffer.byteLength(body) > MAX_BODY) fail(413, 'Use sample files below 1 MB in this demo.');
  if (input.session && !/^[a-f0-9]{64}$/.test(input.session)) fail(400, 'Use a valid demo session.');
  const directory = await mkdtemp(join(tmpdir(), 'caleane-demo-'));
  const dbFile = join(directory, 'workspace.sqlite');
  let workspace;
  try {
    if (input.state) await writeFile(dbFile, open(input.state, key));
    workspace = await createWorkspace({ dbFile, origin, demo: true, showcase: true, disableExternalServices: true, notificationKey: '', accountMailKey: '', enableStripeCollection: false, stripeWebhookSecret: '' });
    let response;
    const blocked = /^(?:\/api\/signup|\/api\/webhooks\/|\/api\/account\/(?:recovery|reset|verify|verification)|\/api\/calendar-sync)/.test(url.pathname) || /stripe|checkout/.test(url.pathname);
    if (blocked) {
      response = { status: 403, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'This is a sample workspace. Live accounts, connected services and payments are not available in the demo.' })).toString('base64') };
    } else {
      response = await new Promise((resolve, reject) => {
        const request = Readable.from(body ? [Buffer.from(body)] : []);
        Object.assign(request, { method: input.method, url: url.pathname + url.search, headers: { origin, 'content-type': 'application/json', ...(input.session ? { cookie: `studio_session=${input.session}` } : {}), ...(typeof input.idempotencyKey === 'string' ? { 'idempotency-key': input.idempotencyKey.slice(0, 120) } : {}) }, socket: { remoteAddress: 'browser-demo' } });
        const headers = {}, chunks = [];
        const result = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
        result.statusCode = 200;
        result.headersSent = false;
        result.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
        result.getHeader = name => headers[name.toLowerCase()];
        result.writeHead = (status, values = {}) => { result.statusCode = status; for (const [name, value] of Object.entries(values)) result.setHeader(name, value); result.headersSent = true; return result; };
        result.on('error', reject);
        result.on('finish', () => resolve({ status: result.statusCode, headers, body: Buffer.concat(chunks).toString('base64') }));
        workspace.server.emit('request', request, result);
      });
    }
    if (url.pathname === '/api/info') response.body = Buffer.from(JSON.stringify({ demo: true, hostedDemo: true, signup: false })).toString('base64');
    const cookie = String(response.headers['set-cookie'] || '');
    const session = cookie ? cookie.match(/studio_session=([a-f0-9]*)/)?.[1] || '' : input.session || '';
    delete response.headers['set-cookie'];
    workspace.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    workspace.db.close();
    workspace.db = null;
    const state = seal(await readFile(dbFile), key);
    return { state, session, response };
  } finally {
    workspace?.db?.close();
    workspace?.server.emit('close');
    await rm(directory, { recursive: true, force: true });
  }
}

export default async function hostedDemoHandler(req, res) {
  const origin = process.env.APP_ORIGIN || 'https://app.caleane.com';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method !== 'POST' || req.headers.origin !== origin) fail(403, 'Use the Caleane demo to make this request.');
    let input = req.body;
    if (!input) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 4_000_000) fail(413, 'This sample request is too large.'); chunks.push(chunk); } input = Buffer.concat(chunks).toString(); }
    if (typeof input === 'string' || Buffer.isBuffer(input)) { try { input = JSON.parse(input.toString()); } catch { fail(400, 'Use a valid demo request.'); } }
    const data = await runHostedDemo(input, { origin, key: Buffer.from(process.env.CALEANE_DEMO_STATE_KEY || '', 'base64') });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  } catch (error) {
    res.statusCode = error.status || 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.status ? error.message : 'The demo could not complete that request. Please try again.' }));
  }
}
