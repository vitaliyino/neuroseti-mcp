/**
 * Zero-dependency TypeScript/ESM SDK for Neuroseti.ru Open Data API (RF).
 * Works in Node.js >= 20, Deno, Bun, Cloudflare Workers and edge runtimes.
 */

export class NeurosetiDataError extends Error {
  constructor(status, code, message) {
    super(`Neuroseti API HTTP ${status} (${code}): ${message}`);
    this.name = 'NeurosetiDataError';
    this.status = status;
    this.code = code;
  }
}

export class NeurosetiDataClient {
  constructor({ apiKey, baseUrl = 'https://api.neuroseti.ru/v1/data', fetchImpl = fetch } = {}) {
    const key = String(apiKey || (typeof process !== 'undefined' ? process.env?.NEUROSETI_API_KEY : '') || '').trim();
    if (!key) {
      throw new Error('Pass { apiKey: "nsr_..." } or set NEUROSETI_API_KEY environment variable.');
    }
    this.apiKey = key;
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async _get(path, params) {
    const sp = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue;
        sp.set(k, String(v));
      }
    }
    const qs = sp.toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'neuroseti-data-js/0.7.0',
      },
    });
    return this._parseResponse(res);
  }

  async _post(path, body) {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'neuroseti-data-js/0.7.0',
      },
      body: JSON.stringify(body),
    });
    return this._parseResponse(res);
  }

  async _parseResponse(res) {
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new NeurosetiDataError(res.status, 'invalid_json', text.slice(0, 200));
    }
    if (!res.ok) {
      throw new NeurosetiDataError(res.status, parsed?.error?.code || 'http_error', parsed?.error?.message || text.slice(0, 200));
    }
    return parsed;
  }

  listModels(params) {
    return this._get('/models', params);
  }

  searchTgPosts(params) {
    return this._get('/tg/search', params);
  }

  getCompanyByInn(inn) {
    return this._get(`/ru/company/${encodeURIComponent(String(inn).trim())}`);
  }

  getCbrRates(date) {
    return this._get('/ru/cbr/rates', { date });
  }

  calcPenalty({ amount, from, to, mode = 'art395' }) {
    return this._get('/ru/finance/penalty', { amount, from, to, mode });
  }

  lookupBic(bic) {
    return this._get(`/ru/cbr/bic/${encodeURIComponent(String(bic).trim())}`);
  }

  addWorkdays({ date, days }) {
    return this._get('/ru/calendar/add-workdays', { date, days });
  }

  searchOkved(q) {
    return this._get('/ru/okved/search', { q });
  }

  searchDrugs(params) {
    return this._get('/med/drugs/search', params);
  }

  searchIcd10(q) {
    return this._get('/med/icd10/search', { q });
  }

  searchTrademarks(params) {
    return this._get('/ip/trademarks/search', params);
  }

  checkMarkirovka(params) {
    return this._get('/ecom/markirovka/check', params);
  }

  searchTnved(q) {
    return this._get('/ecom/tnved/search', { q });
  }

  checkContractor(inn) {
    return this._get(`/construction/contractor/${encodeURIComponent(String(inn).trim())}`);
  }

  calcMortgage({ price, downPayment = 0, years = 20, rate, mode = 'annuity' }) {
    return this._get('/real-estate/mortgage-calc', { price, down_payment: downPayment, years, rate, mode });
  }

  getMarketSalaries(params) {
    return this._get('/market/salaries', params);
  }

  getFreelanceVsApi(params) {
    return this._get('/market/freelance-vs-api', params);
  }

  checkCounterparty360(inn) {
    return this._get(`/ru/counterparty/${encodeURIComponent(String(inn).trim())}`);
  }

  checkCounterpartyBatch(inns, { liveSro = false } = {}) {
    return this._post('/ru/counterparty/batch', { inns, live_sro: Boolean(liveSro) });
  }

  getDataQuota() {
    return this._get('/quota');
  }
}
