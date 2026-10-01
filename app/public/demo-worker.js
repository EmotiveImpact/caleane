const DATABASE = 'caleane-sample-preview-v1';
let queue = Promise.resolve();
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function stored(value) {
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open(DATABASE, 1); request.onupgradeneeded = () => request.result.createObjectStore('preview'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('preview', value === undefined ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('preview');
      const request = value === undefined ? store.get('state') : store.put(value, 'state');
      transaction.oncomplete = () => resolve(value === undefined ? request.result || {} : value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

function errorResponse(message, status = 503) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function workspaceRequest(request) {
  try {
    const previous = await stored();
    const url = new URL(request.url);
    const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
    const result = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...previous, url: url.pathname + url.search, method: request.method, body, idempotencyKey: request.headers.get('Idempotency-Key') || '' }) });
    const data = await result.json();
    if (!result.ok) return errorResponse(data.error || 'Please try the demo again.', result.status);
    await stored({ state: data.state, session: data.session });
    const raw = atob(data.response.body);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    return new Response(request.method === 'HEAD' || [204, 304].includes(data.response.status) ? null : bytes, { status: data.response.status, headers: data.response.headers });
  } catch { return errorResponse('The demo could not connect. Please try again.'); }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/api/') || url.pathname === '/api/demo') return;
  const pending = queue.then(() => workspaceRequest(event.request));
  queue = pending.then(() => undefined, () => undefined);
  event.respondWith(pending);
});
self.addEventListener('message', event => {
  if (event.data !== 'reset-caleane-demo') return;
  const pending = queue.then(() => stored({}));
  queue = pending.then(() => undefined, () => undefined);
  event.waitUntil(pending.then(() => event.ports[0]?.postMessage('reset')));
});
