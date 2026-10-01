import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const { runHostedDemo, default: handler } = await import(process.env.CALEANE_TEST_DEMO_BUNDLE === '1' ? '../hosted-demo-runtime.mjs' : '../hosted-demo.mjs');

const options = { origin: 'https://app.caleane.com', key: randomBytes(32) };
function browser() {
  let saved = {};
  return async (url, method = 'GET', body) => {
    const result = await runHostedDemo({ ...saved, url, method, body: body ? JSON.stringify(body) : '' }, options);
    saved = { state: result.state, session: result.session };
    return { status: result.response.status, data: JSON.parse(Buffer.from(result.response.body, 'base64').toString()), saved };
  };
}

test('hosted demo keeps a visitor workspace across fresh server instances and isolates other visitors', async () => {
  const one = browser(), two = browser();
  assert.deepEqual((await one('/api/info')).data, { demo: true, hostedDemo: true, signup: false });
  assert.equal((await one('/api/me')).status, 401);
  assert.equal((await one('/api/login', 'POST', { email: 'studio@example.test', password: 'StudioDemo2026!' })).status, 200);
  const me = await one('/api/me');
  const studioId = me.data.studios[0].id;
  assert.equal(me.data.studios[0].role, 'owner');
  assert.equal((await one(`/api/clients?studio=${studioId}`, 'POST', { name: 'Demo visitor client', email: 'visitor@example.test' })).status, 201);
  assert.ok((await one(`/api/clients?studio=${studioId}`)).data.clients.some(client => client.name === 'Demo visitor client'));
  await two('/api/login', 'POST', { email: 'studio@example.test', password: 'StudioDemo2026!' });
  const secondStudio = (await two('/api/me')).data.studios[0].id;
  assert.notEqual(studioId, secondStudio);
  assert.ok(!(await two(`/api/clients?studio=${secondStudio}`)).data.clients.some(client => client.name === 'Demo visitor client'));
  assert.equal((await two(`/api/clients?studio=${studioId}`)).status, 403);
});

test('the same demo switches between studio and client using the real access checks', async () => {
  const visitor = browser();
  await visitor('/api/login', 'POST', { email: 'studio@example.test', password: 'StudioDemo2026!' });
  const studioId = (await visitor('/api/me')).data.studios[0].id;
  const ownerProjects = await visitor(`/api/projects?studio=${studioId}`);
  assert.equal(ownerProjects.data.projects.length, 3);
  await visitor('/api/logout', 'POST', {});
  assert.equal((await visitor('/api/me')).status, 401);
  await visitor('/api/login', 'POST', { email: 'amelia@example.test', password: 'StudioDemo2026!' });
  const client = await visitor('/api/me');
  assert.equal(client.data.studios[0].role, 'client');
  assert.equal((await visitor(`/api/projects?studio=${studioId}`)).data.projects.length, 1);
  assert.equal((await visitor(`/api/clients?studio=${studioId}`)).status, 403);
});

test('hosted demo rejects altered snapshots, real signup, provider routes and oversized uploads', async () => {
  const visitor = browser();
  const initial = await visitor('/api/info');
  await assert.rejects(runHostedDemo({ url: '/api/info', method: 'GET', state: initial.saved.state.slice(0, -8) + 'AAAAAAAA' }, options), { status: 400 });
  await assert.rejects(runHostedDemo({ url: 'https://other.example/api/info', method: 'GET' }, options), { status: 400 });
  await assert.rejects(runHostedDemo({ url: '/api/demo', method: 'GET' }, options), { status: 400 });
  await assert.rejects(runHostedDemo({ url: '/api/info', method: 'POST', body: 'a'.repeat(1_500_001) }, options), { status: 413 });
  for (const url of ['/api/signup', '/api/calendar-sync', '/api/account/recovery', '/api/stripe/connect', '/api/webhooks/stripe']) assert.equal((await visitor(url, 'POST', {})).status, 403);
});

test('demo handler refuses cross-origin calls before processing data', async () => {
  const response = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: 'POST', headers: { origin: 'https://other.example' }, body: {} }, response);
  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /Caleane demo/);
});
