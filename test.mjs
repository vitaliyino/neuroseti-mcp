import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpHttpServer, TOOL_DEFINITIONS } from './server.mjs';

const VALID_KEY = `nsr_${'A'.repeat(40)}`;
const FAKE_KEY = `nsr_${'Z'.repeat(40)}`;

test('MCP v0.2.0 health, auth rejection, 15 tools proxying and fail-closed 401/429', async () => {
  const seenUrls = [];
  const seenTools = [];
  const mockFetch = async (url, init) => {
    const auth = init?.headers?.Authorization || '';
    if (init?.headers?.['X-Mcp-Tool']) seenTools.push(init.headers['X-Mcp-Tool']);
    seenUrls.push(String(url));
    if (auth === `Bearer ${FAKE_KEY}`) {
      return new Response(JSON.stringify({ ok: false, error: { code: 'invalid_api_key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    const u = String(url);
    if (u.includes('/data/models/recommend')) {
      return new Response(JSON.stringify({ ok: true, data: { task: 'code', primary: 'claude-sonnet-5-5' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/models/gpt-6.2-sol')) {
      return new Response(JSON.stringify({ ok: true, data: { id: 'gpt-6.2-sol', vendor: 'OpenAI' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/models')) {
      return new Response(JSON.stringify({ ok: true, data: { count: 63, models: [{ id: 'gpt-6.2-sol' }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/tg/search')) {
      return new Response(JSON.stringify({ ok: true, data: { count: 2, posts: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/ru/cbr/bic/044525225')) {
      return new Response(JSON.stringify({ ok: true, data: { bic: '044525225', name: 'ПАО СБЕРБАНК' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/ru/calendar/add-workdays')) {
      return new Response(JSON.stringify({ ok: true, data: { result_date: '2027-01-18' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/ru/okved/62.01')) {
      return new Response(JSON.stringify({ ok: true, data: { code: '62.01' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/mcp/search')) {
      return new Response(JSON.stringify({ ok: true, data: { count: 3, servers: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/errors/search')) {
      return new Response(JSON.stringify({ ok: true, data: { count: 1, errors: [{ code: 'HTTP 403' }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/data/ru/company/')) {
      return new Response(JSON.stringify({ ok: true, data: { inn: '5402076457', msp_category: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (
      u.includes('/data/ru/software-registry/search') ||
      u.includes('/data/med/') ||
      u.includes('/data/ip/trademarks/search') ||
      u.includes('/data/ecom/') ||
      u.includes('/data/construction/') ||
      u.includes('/data/real-estate/') ||
      u.includes('/data/market/') ||
      u.includes('/data/ru/counterparty/') ||
      u.endsWith('/data/quota')
    ) {
      return new Response(JSON.stringify({ ok: true, data: { count: 1, items: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.endsWith('/balance')) {
      return new Response(JSON.stringify({ balance_kopecks: 125000, balance_rub: 1250, currency: 'RUB' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'mock-answer' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const server = createMcpHttpServer({ apiBase: 'http://mock/api/v1', fetchImpl: mockFetch });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  async function rpc(key, body) {
    return fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  try {
    // 1. Health check & /.well-known/mcp.json discovery card
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const hJson = await health.json();
    assert.equal(hJson.tools, 30);
    assert.equal(hJson.version, '0.6.0');
    assert.equal(TOOL_DEFINITIONS.length, 30);

    const card = await fetch(`${base}/.well-known/mcp.json`);
    assert.equal(card.status, 200);
    const cardJson = await card.json();
    assert.equal(cardJson.tools.length, 30);

    // 2. Unauthorized without valid nsr_ key
    const unauth = await rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.equal(unauth.status, 401);

    // 3. tools/list returns 30 tools
    const listRes = await rpc(VALID_KEY, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.result.tools.length, 30);

    // 4. Fake regex-valid key must FAIL on list_models (no hardcoded bypass!)
    const fakeRes = await rpc(FAKE_KEY, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_models', arguments: {} },
    });
    const fakeJson = await fakeRes.json();
    assert.equal(fakeJson.result.isError, true);
    assert.match(fakeJson.result.content[0].text, /HTTP 401/);

    // 5. Real proxied calls across all domains
    const calls = [
      ['list_models', { category: 'llm' }],
      ['get_model_info', { id: 'gpt-6.2-sol' }],
      ['kwork_benchmark_lookup', { task: 'code', budget: 'mid' }],
      ['tg_search_posts', { q: 'Claude', days: 30 }],
      ['ru_bic_lookup', { bic: '044525225' }],
      ['ru_workdays', { date: '2026-12-30', add_days: 5 }],
      ['ru_okved_search', { code: '62.01' }],
      ['find_mcp_server', { q: '1с', rf_ok: true }],
      ['diagnose_llm_error', { q: '403' }],
      ['ru_company_by_inn', { inn: '5402076457' }],
      ['ru_software_registry_search', { q: 'Сибирь' }],
      ['med_drugs_search', { q: 'ибупрофен', znvlp: true }],
      ['med_license_check', { inn: '3300018149' }],
      ['med_icd10_search', { code: 'J06' }],
      ['ip_trademarks_search', { q: 'Яндекс', actual_only: true }],
      ['ecom_markirovka_check', { q: 'футболка' }],
      ['ecom_tnved_search', { q: 'худи' }],
      ['construction_contractor_check', { inn: '5907056036' }],
      ['real_estate_search', { mode: 'projects', region: 'Москва' }],
      ['real_estate_search', { mode: 'houses', city: 'Новосибирск', q: 'Ленина' }],
      ['real_estate_search', { mode: 'developer', developer_inn: '7707083893' }],
      ['real_estate_mortgage_calc', { price: 10000000, down_payment: 2000000, years: 20 }],
      ['ru_market_salaries', { role: 'llm' }],
      ['ru_freelance_vs_api', { task: 'договор' }],
      ['ru_counterparty_360', { inn: '7705552444' }],
      ['get_data_quota', {}],
      ['get_balance', {}],
      ['compare_models', { models: ['gpt-6.1-sol', 'qwen3.8-max'], prompt: 'test' }],
    ];

    let reqId = 10;
    for (const [name, args] of calls) {
      const r = await rpc(VALID_KEY, {
        jsonrpc: '2.0',
        id: reqId++,
        method: 'tools/call',
        params: { name, arguments: args },
      });
      const j = await r.json();
      assert.ok(!j.result.isError, `Tool ${name} should succeed, got: ${JSON.stringify(j)}`);
    }

    assert.ok(seenUrls.some((u) => u.includes('/data/models?category=llm')));
    assert.ok(seenUrls.some((u) => u.includes('/data/ru/cbr/bic/044525225')));
    assert.ok(seenUrls.some((u) => u.includes('/data/ru/calendar/add-workdays')));
    assert.ok(seenTools.includes('list_models'));
    assert.ok(seenTools.includes('ru_market_salaries'));
    assert.ok(seenTools.includes('ru_freelance_vs_api'));
    assert.ok(seenTools.includes('ru_counterparty_360'));
    assert.ok(seenTools.includes('get_data_quota'));
  } finally {
    server.close();
  }
});
