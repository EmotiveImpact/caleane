import { Readable, Writable } from 'node:stream';

// Fills a brand new sample workspace with the money and decision history a real studio would have,
// so visitors can see invoices, payments, costs, decisions and form responses straight away.
// Everything goes through the workspace's own API, so the records are exactly what the app would create.
export async function seedShowcase({ server, db, origin }) {
  const sessions = {};
  const call = (route, method = 'GET', body, as = 'owner', headers = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const request = Readable.from(payload ? [Buffer.from(payload)] : []);
    Object.assign(request, { method, url: route, headers: { origin, 'content-type': 'application/json', ...(sessions[as] ? { cookie: `studio_session=${sessions[as]}` } : {}), ...headers }, socket: { remoteAddress: 'showcase' } });
    const chunks = [], response = {};
    const result = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    Object.assign(result, {
      statusCode: 200, headersSent: false,
      setHeader: (name, value) => { response[name.toLowerCase()] = value; },
      getHeader: name => response[name.toLowerCase()],
      writeHead: (status, values = {}) => { result.statusCode = status; for (const [name, value] of Object.entries(values)) result.setHeader(name, value); result.headersSent = true; return result; },
    });
    result.on('error', reject);
    result.on('finish', () => {
      const session = String(response['set-cookie'] || '').match(/studio_session=([a-f0-9]+)/)?.[1];
      if (session) sessions[as] = session;
      const data = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (result.statusCode >= 400) reject(new Error(`${method} ${route}: ${data.error || result.statusCode}`));
      else resolve(data);
    });
    server.emit('request', request, result);
  });

  await call('/api/login', 'POST', { email: 'studio@example.test', password: 'StudioDemo2026!' }, 'owner');
  await call('/api/login', 'POST', { email: 'amelia@example.test', password: 'StudioDemo2026!' }, 'client');
  const studioId = (await call('/api/me')).studios[0].id, q = `?studio=${studioId}`;
  const projects = (await call('/api/projects' + q)).projects;
  const amelia = projects.find(p => p.brief?.name === 'Amelia Taylor'), olivia = projects.find(p => p.brief?.name === 'Olivia Chen');
  const today = new Date().toISOString().slice(0, 10);
  const inDays = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  const { defaults } = await call('/api/billing-defaults' + q);
  await call('/api/billing-defaults' + q, 'POST', { ...defaults, sellerAddress: '14 Columbia Road, London E2 7RG', sellerContact: 'studio@example.test', vatRegistered: true, taxRate: 20, taxRegistration: 'GB 123 4567 89', paymentInstructions: 'Bank transfer to NAY Décor Ltd. Please use the invoice number as your reference.' });
  const billing = (project, address) => ({ supplyDate: project.brief.date, customerAddress: address });

  // Amelia: estimate confirmed by the client, deposit paid, balance waiting.
  let estimate = (await call(`/api/projects/${amelia.id}/estimates${q}`, 'POST', { title: 'Wedding styling', currency: 'GBP', taxRate: 20, items: [
    { title: 'Floral design and installation', quantity: 1, unitAmount: 320000 },
    { title: 'Candles and table styling', quantity: 1, unitAmount: 145000 },
    { title: 'Styling team on the day', quantity: 2, unitAmount: 48000 },
  ] })).project.estimates.at(-1);
  await call(`/api/projects/${amelia.id}/estimate-decision${q}`, 'POST', { estimateId: estimate.id, decision: 'confirm' }, 'client');
  const deposit = (await call(`/api/projects/${amelia.id}/invoices${q}`, 'POST', { estimateId: estimate.id, kind: 'Deposit', amountMinor: 200000, dueDate: today, ...billing(amelia, '22 Elgin Crescent, London W11 2JR') })).invoice;
  await call(`/api/projects/${amelia.id}/invoices/${deposit.id}/payments${q}`, 'POST', { amountMinor: deposit.amountMinor, method: 'bank_transfer', receivedAt: today, reference: deposit.number });
  await call(`/api/projects/${amelia.id}/invoices${q}`, 'POST', { estimateId: estimate.id, kind: 'Balance', dueDate: inDays(120), ...billing(amelia, '22 Elgin Crescent, London W11 2JR') });

  // Olivia: an estimate sent and waiting on her reply.
  await call(`/api/projects/${olivia.id}/estimates${q}`, 'POST', { title: 'Dinner styling', currency: 'GBP', taxRate: 20, items: [
    { title: 'Table styling and linen', quantity: 1, unitAmount: 185000 },
    { title: 'Low floral arrangements', quantity: 1, unitAmount: 95000 },
  ] });

  for (const cost of [
    { projectId: amelia.id, description: 'Ivory garden roses and ranunculus', supplier: 'Columbia Road Flowers', category: 'Materials', amountMinor: 42000 },
    { projectId: olivia.id, description: 'Linen hire', supplier: 'The Linen Room', category: 'Venue and hire', amountMinor: 18500 },
  ]) await call('/api/expenses' + q, 'POST', { action: 'create', currency: 'GBP', spentOn: today, ...cost });

  // A choice Amelia has already made, so Recent decisions has something in it.
  const shared = (await call(`/api/projects/${amelia.id}/decisions${q}`, 'POST', { title: 'Choose the candle colour', description: 'Both work with ivory flowers. Which feels more like you?', options: [
    { label: 'Ivory', detail: 'Quiet and seamless with the florals.' },
    { label: 'Champagne', detail: 'A little warmer, picks up the fabric accents.' },
  ] })).project.decisions.at(-1);
  await call(`/api/projects/${amelia.id}/decision-choice${q}`, 'POST', { decisionId: shared.id, optionId: shared.options[0].id, note: 'Ivory, please. It feels calmer.' }, 'client');

  // One response to the published enquiry form, which the Forms page creates on first visit.
  await call('/api/forms' + q);
  await call('/api/public/nay-decor/forms/enquiry/enquiries', 'POST', { name: 'Sophie Clarke', email: 'sophie@example.test', occasion: 'Private celebration', formVersion: 1, date: '2027-09-04', venue: 'A walled garden in Kent', vision: 'A long lunch for our parents’ fortieth anniversary. Garden flowers, soft colour and a table that feels generous.' }, 'visitor', { 'idempotency-key': 'showcase-sophie' });

  // The sample visitor signs in with the demo buttons, so the seeding sessions are not kept.
  db.prepare('DELETE FROM sessions').run();
}
