export class NeurosetiDataError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string);
}

export interface NeurosetiClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ApiEnvelope<T = unknown> {
  ok: true;
  data: T;
  meta: {
    source: string;
    as_of: string;
    latency_ms: number;
    quota?: {
      tier: string;
      limit: number;
      remaining: number;
      reset_msk: string;
    };
  };
}

export class NeurosetiDataClient {
  constructor(options?: NeurosetiClientOptions);
  listModels(params?: { category?: string; vendor?: string; q?: string; channel?: 'economy' | 'enterprise' }): Promise<ApiEnvelope>;
  searchTgPosts(params: { q: string; days?: number; exclude_ads?: boolean; limit?: number }): Promise<ApiEnvelope>;
  getCompanyByInn(inn: string): Promise<ApiEnvelope>;
  getCbrRates(date?: string): Promise<ApiEnvelope>;
  calcPenalty(params: { amount: number; from: string; to: string; mode?: 'art395' | '1_300' | '1_150' }): Promise<ApiEnvelope>;
  lookupBic(bic: string): Promise<ApiEnvelope>;
  addWorkdays(params: { date: string; days: number }): Promise<ApiEnvelope>;
  searchOkved(q: string): Promise<ApiEnvelope>;
  searchDrugs(params: { q?: string; mnn?: string; znvlp?: boolean }): Promise<ApiEnvelope>;
  searchIcd10(q: string): Promise<ApiEnvelope>;
  searchTrademarks(params: { q?: string; inn?: string; actual_only?: boolean }): Promise<ApiEnvelope>;
  checkMarkirovka(params: { tnved?: string; q?: string }): Promise<ApiEnvelope>;
  searchTnved(q: string): Promise<ApiEnvelope>;
  checkContractor(inn: string): Promise<ApiEnvelope>;
  calcMortgage(params: { price: number; downPayment?: number; years?: number; rate?: number; mode?: 'annuity' | 'differentiated' }): Promise<ApiEnvelope>;
  getMarketSalaries(params?: { role?: string; category?: string }): Promise<ApiEnvelope>;
  getFreelanceVsApi(params?: { task?: string; category?: string }): Promise<ApiEnvelope>;
  checkCounterparty360(inn: string): Promise<ApiEnvelope>;
  getDataQuota(): Promise<ApiEnvelope>;
}
