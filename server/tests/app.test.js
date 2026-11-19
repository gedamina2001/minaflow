import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp, createUserClient } from '../app.js';
import { loadConfig } from '../config.js';
import { todayInTimezone, parse, date } from '../validation.js';

const userId = '11111111-1111-4111-8111-111111111111';
const recordId = '22222222-2222-4222-8222-222222222222';
const config = { FRONTEND_ORIGIN: 'http://localhost:5173', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
const authHeader = 'Bearer test-user-token';
function fixture({ results = [], authError, user = { id: userId } } = {}) {
  const calls = [];
  let clientCount = 0;
  const clientFactory = () => {
    clientCount++;
    return {
      auth: { async getUser(token) { calls.push(['auth', token]); return { data: { user }, error: authError }; } },
      from(table) {
        calls.push(['from', table]);
        const builder = new Proxy({}, {
          get(target, method) {
            if (method === 'then') return (resolve, reject) => Promise.resolve(results.shift() || { data: null, error: null }).then(resolve, reject);
            return (...args) => { calls.push([method, ...args]); return builder; };
          },
        });
        return builder;
      },
    };
  };
  return { app: createApp(config, { clientFactory }), calls, get clientCount() { return clientCount; } };
}

test('health works without authentication and does not contact Supabase', async () => {
  const f = fixture();
  const response = await request(f.app).get('/api/health').expect(200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(f.clientCount, 0);
});
test('Express serves the frontend without exposing environment files', async () => {
  const f = fixture();
  const page = await request(f.app).get('/').expect(200).expect('Content-Type', /html/);
  assert.match(page.text, /MinaFlow/);
  await request(f.app).get('/app.js').expect(200);
  await request(f.app).get('/.env').expect(404);
  await request(f.app).get('/credentials.md').expect(404);
  assert.equal(f.clientCount, 0);
});
test('all personal routes require bearer authentication', async () => {
  const f = fixture();
  for (const [method, path] of [['get', '/api/settings'], ['patch', '/api/settings'], ['get', '/api/periods'], ['post', '/api/periods'], ['patch', `/api/periods/${recordId}`], ['delete', `/api/periods/${recordId}`], ['get', '/api/check-ins'], ['put', '/api/check-ins/2026-01-01'], ['delete', '/api/check-ins/2026-01-01']]) {
    await request(f.app)[method](path).expect(401);
  }
  assert.equal(f.clientCount, 0);
});
test('invalid sessions are denied before database access', async () => {
  const f = fixture({ authError: { status: 401 } });
  await request(f.app).get('/api/periods').set('Authorization', authHeader).expect(401);
  assert.deepEqual(f.calls, [['auth', 'test-user-token']]);
});
test('auth outages return 503', async () => {
  const f = fixture({ authError: { status: 503 } });
  await request(f.app).get('/api/settings').set('Authorization', authHeader).expect(503);
});
test('clients are created separately per request', async () => {
  const f = fixture();
  await request(f.app).get('/api/settings').set('Authorization', authHeader).expect(200);
  await request(f.app).get('/api/settings').set('Authorization', authHeader).expect(200);
  assert.equal(f.clientCount, 2);
});
test('ownership and generated fields cannot be supplied in payloads', async () => {
  const f = fixture();
  await request(f.app).post('/api/periods').set('Authorization', authHeader).send({ start_date: '2026-01-01', user_id: recordId }).expect(400);
  await request(f.app).patch('/api/settings').set('Authorization', authHeader).send({ created_at: '2000-01-01' }).expect(400);
  assert.equal(f.calls.some(call => call[0] === 'from'), false);
});
test('lists apply ownership, pagination, and date filters', async () => {
  const f = fixture({ results: [{ data: [], error: null }] });
  await request(f.app).get('/api/periods?limit=5&offset=10&from=2026-01-01&to=2026-02-01').set('Authorization', authHeader).expect(200);
  assert.ok(f.calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'user_id', userId])));
  assert.ok(f.calls.some(call => JSON.stringify(call) === JSON.stringify(['range', 10, 14])));
  assert.ok(f.calls.some(call => call[0] === 'gte' && call[2] === '2026-01-01'));
});
test('invalid list parameters are rejected', async () => {
  const f = fixture();
  for (const query of ['limit=101', 'offset=-1', 'from=2026-02-30', 'from=2026-02-01&to=2026-01-01']) {
    await request(f.app).get(`/api/periods?${query}`).set('Authorization', authHeader).expect(400);
  }
});
test('new periods use authenticated identity', async () => {
  const f = fixture({ results: [{ data: { timezone: 'Asia/Kolkata' } }, { data: { id: recordId } }] });
  await request(f.app).post('/api/periods').set('Authorization', authHeader).send({ start_date: '2026-01-01', end_date: '2026-01-05' }).expect(201);
  assert.equal(f.calls.find(call => call[0] === 'insert')[1].user_id, userId);
});
test('future and reversed period dates are rejected', async () => {
  const f = fixture();
  for (const body of [{ start_date: '2999-01-01' }, { start_date: '2026-01-05', end_date: '2026-01-01' }]) {
    await request(f.app).post('/api/periods').set('Authorization', authHeader).send(body).expect(400);
  }
  assert.equal(f.calls.some(call => call[0] === 'insert'), false);
});
test('missing periods return 404 and invalid identifiers return 400', async () => {
  const f = fixture();
  await request(f.app).patch(`/api/periods/${recordId}`).set('Authorization', authHeader).send({ notes: 'Update' }).expect(404);
  await request(f.app).delete('/api/periods/invalid').set('Authorization', authHeader).expect(400);
});
test('partial period edits validate the merged date range', async () => {
  const f = fixture({ results: [{ data: { start_date: '2026-01-05', end_date: '2026-01-08' } }, { data: null }] });
  await request(f.app).patch(`/api/periods/${recordId}`).set('Authorization', authHeader).send({ end_date: '2026-01-01' }).expect(400);
  assert.equal(f.calls.some(call => call[0] === 'update'), false);
});
test('check-ins deduplicate symptoms and use a per-user date conflict key', async () => {
  const f = fixture({ results: [{ data: null }, { data: { id: recordId } }] });
  await request(f.app).put('/api/check-ins/2026-01-01').set('Authorization', authHeader).send({ symptoms: ['cramps', 'cramps'], pain_level: 4 }).expect(200);
  const call = f.calls.find(call => call[0] === 'upsert');
  assert.deepEqual(call[1].symptoms, ['cramps']);
  assert.equal(call[1].user_id, userId);
  assert.equal(call[2].onConflict, 'user_id,entry_date');
});
test('invalid check-ins and unsupported timezones are rejected', async () => {
  const f = fixture();
  for (const body of [{ pain_level: 11 }, { symptoms: ['unknown'] }, { mood: 'unknown' }]) {
    await request(f.app).put('/api/check-ins/2026-01-01').set('Authorization', authHeader).send(body).expect(400);
  }
  await request(f.app).put('/api/check-ins/2026-02-30').set('Authorization', authHeader).send({}).expect(400);
  await request(f.app).patch('/api/settings').set('Authorization', authHeader).send({ timezone: 'Invalid/Zone' }).expect(400);
});
test('database conflicts are useful and database details stay private', async () => {
  for (const [code, expected] of [['23P01', 409], ['23505', 409], ['XX000', 502]]) {
    const f = fixture({ results: [{ data: null }, { error: { code, message: 'PRIVATE HEALTH NOTE' } }] });
    const response = await request(f.app).post('/api/periods').set('Authorization', authHeader).send({ start_date: '2026-01-01' }).expect(expected);
    assert.ok(!JSON.stringify(response.body).includes('PRIVATE HEALTH NOTE'));
  }
});
test('malformed and oversized JSON return consistent errors', async () => {
  const f = fixture();
  await request(f.app).post('/api/periods').set('Content-Type', 'application/json').send('{broken').expect(400);
  await request(f.app).post('/api/periods').send({ notes: 'x'.repeat(40000) }).expect(413);
});
test('deletes filter by owner and missing records return 404', async () => {
  const f = fixture({ results: [{ data: { id: recordId } }, { data: null }] });
  await request(f.app).delete(`/api/periods/${recordId}`).set('Authorization', authHeader).expect(204);
  await request(f.app).delete('/api/check-ins/2026-01-01').set('Authorization', authHeader).expect(404);
  assert.ok(f.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === userId));
});
test('CORS permits the configured frontend origin', async () => {
  const f = fixture();
  const response = await request(f.app).options('/api/periods').set('Origin', config.FRONTEND_ORIGIN).set('Access-Control-Request-Method', 'POST').expect(204);
  assert.equal(response.headers['access-control-allow-origin'], config.FRONTEND_ORIGIN);
});
test('calendar dates respect timezone boundaries', () => {
  const now = new Date('2026-11-19T23:30:00Z');
  assert.equal(todayInTimezone('Asia/Kolkata', now), '2026-11-20');
  assert.equal(todayInTimezone('America/Los_Angeles', now), '2026-11-19');
  assert.throws(() => parse(date, '2026-02-29'));
  assert.equal(parse(date, '2028-02-29'), '2028-02-29');
});
test('configuration fails safely without credentials or with a secret key', () => {
  assert.throws(() => loadConfig({}), /SUPABASE_URL/);
  assert.throws(() => loadConfig({ ...config, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do_not_print' }), error => !error.message.includes('do_not_print'));
  assert.equal(loadConfig(config).PORT, 3000);
});
test('real Supabase client forwards bearer identity to Auth and REST requests', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), headers: new Headers(options.headers) });
    return new Response(JSON.stringify(String(url).includes('/auth/v1/') ? { id: userId, aud: 'authenticated' } : []), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const client = createUserClient(config, 'test-user-token');
    const result = await client.auth.getUser('test-user-token');
    assert.equal(result.data.user.id, userId);
    await client.from('periods').select('*');
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.headers.get('authorization'), authHeader);
      assert.equal(call.headers.get('apikey'), config.SUPABASE_PUBLISHABLE_KEY);
    }
  } finally { globalThis.fetch = originalFetch; }
});
