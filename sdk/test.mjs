import assert from 'node:assert/strict';
import test from 'node:test';
import { NeurosetiDataClient, NeurosetiDataError } from './neuroseti-data.mjs';

test('NeurosetiDataClient JS/TS SDK calls endpoints with Bearer key and parses errors', async () => {
  const seen = [];
  const mockFetch = async (url, init) => {
    seen.push({ url: String(url), method: init?.method || 'GET', auth: init?.headers?.Authorization, body: init?.body });
    if (String(url).includes('/bad')) {
      return new Response(JSON.stringify({ ok: false, error: { code: 'invalid_api_key', message: 'Bad key' } }), { status: 401 });
    }
    return new Response(JSON.stringify({ ok: true, data: { mocked: true }, meta: { source: 'test', as_of: '2026-11-24', latency_ms: 1 } }), { status: 200 });
  };

  const client = new NeurosetiDataClient({ apiKey: `nsr_${'A'.repeat(40)}`, fetchImpl: mockFetch });
  const r1 = await client.checkMarkirovka({ q: 'футболка' });
  assert.equal(r1.ok, true);
  assert.match(seen[0].url, /\/ecom\/markirovka\/check\?q=/);
  assert.equal(seen[0].auth, `Bearer nsr_${'A'.repeat(40)}`);

  const r2 = await client.checkContractor('5047176993');
  assert.equal(r2.ok, true);
  assert.match(seen[1].url, /\/construction\/contractor\/5047176993$/);

  const r3 = await client.checkCounterpartyBatch(['7705552444', '5047176993'], { liveSro: true });
  assert.equal(r3.ok, true);
  assert.equal(seen[2].method, 'POST');
  assert.match(seen[2].url, /\/ru\/counterparty\/batch$/);
  assert.deepEqual(JSON.parse(seen[2].body), { inns: ['7705552444', '5047176993'], live_sro: true });

  const r4 = await client.getDataQuota();
  assert.equal(r4.ok, true);
  assert.match(seen[3].url, /\/quota$/);

  await assert.rejects(() => client._get('/bad'), NeurosetiDataError);
  assert.throws(() => new NeurosetiDataClient({ apiKey: '' }));
});
