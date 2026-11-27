#!/usr/bin/env node
/**
 * Нейросети.ру — Standalone MCP-сервер v0.2.0 (Streamable HTTP + stdio).
 * Без внешних зависимостей (чистый Node.js >= 20 ESM).
 *
 * Архитектура v0.2.0 (D-8):
 * - Никакого локального хардкода прайсов или обхода проверки ключа по regex.
 * - Все 15 инструментов проксируются в NEUROSETI_API_BASE с ключом клиента `nsr_...`,
 *   где происходит реальная проверка в PostgreSQL (LlmApiKey) и учет квоты (DataApiDailyQuota).
 *
 * Инструменты (15):
 *  LLM и баланс (6):
 *   1. list_models            — живой реестр 60+ LLM и медиа-моделей с курсом ЦБ и обоими каналами
 *   2. get_model_info         — подробная карточка модели (цены, longContext, кэш, доступность РФ)
 *   3. ask_model              — запрос к любой из 33 LLM (поддержка eco/<model>)
 *   4. compare_models         — параллельный прогон 1 промпта на 2-4 моделях
 *   5. get_balance            — остаток баланса клиента в рублях
 *   6. kwork_benchmark_lookup — подбор оптимальной модели под задачу и бюджет
 *  Telegram Pulse (3):
 *   7. tg_search_posts        — поиск по базе русскоязычных ИИ- и IT-каналов без рекламы erid
 *   8. tg_get_trends          — динамика упоминаний моделей и тем в русскоязычном ТГ
 *   9. tg_ad_radar            — рекламный радар erid, удаляемых 24ч посевов и рекламодателей
 *  Бизнес-данные РФ (4):
 *  10. ru_cbr_rate            — курсы валют ЦБ РФ на дату, ключевая ставка и расчет пени
 *  11. ru_workdays            — производственный календарь РФ 2020-2027 (проверка и сдвиг на N дней)
 *  12. ru_bic_lookup          — официальный справочник БИК банков РФ (ED807 ЦБ)
 *  13. ru_okved_search        — поиск и расшифровка кодов ОКВЭД-2 (2 770 кодов)
 *  MCP-каталог и ошибки (2):
 *  14. find_mcp_server        — каталог проверенных MCP-серверов для РФ (1С, Битрикс24, Яндекс и др.)
 *  15. diagnose_llm_error     — справочник ошибок LLM API (401/402/403/429 и др.) с кодом фикса
 */
import http from 'node:http';
import readline from 'node:readline';

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_VERSION = '0.9.0';
const KEY_PATTERN = /^nsr_[0-9A-Za-z]{40}$/;

const DEFAULT_API_BASE = (process.env.NEUROSETI_API_BASE || 'https://api.neuroseti.ru/v1').replace(/\/+$/, '');

export const TOOL_DEFINITIONS = [
  {
    name: 'list_models',
    description:
      'Живой реестр 94 моделей (60 LLM + 34 медиа) для РФ: единая цена в рублях по курсу ЦБ, Prompt Cache, контекст и статус доступности.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['llm', 'image', 'video', 'audio'], description: 'Фильтр по категории моделей' },
        vendor: { type: 'string', description: 'Фильтр по провайдеру (OpenAI, Anthropic, Google, DeepSeek, Qwen, Яндекс и др.)' },
        routed_only: { type: 'boolean', description: 'Только модели, доступные через единый ключ Нейросети.ру' },
        max_input_rub: { type: 'number', description: 'Максимальная цена входа (руб./1M токенов или за 1 юнит)' },
        q: { type: 'string', description: 'Поиск по названию или назначению модели' },
      },
    },
  },
  {
    name: 'get_model_info',
    description: 'Возвращает полную карточку модели по ID: единая цена в рублях, контекст, Prompt Cache, longContext и статус в РФ.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'ID модели, напр. gpt-6.2-sol, claude-fable-5-2, gemini-4-carbon, yandexgpt-5-pro' },
      },
    },
  },
  {
    name: 'ask_model',
    description: 'Отправляет запрос в любую из 60 LLM через единый API Нейросети.ру по единой рублевой цене.',
    inputSchema: {
      type: 'object',
      required: ['model', 'prompt'],
      properties: {
        model: { type: 'string', description: 'ID модели, напр. gpt-6.2-sol, claude-fable-5-2, gemini-4-carbon, deepseek-v4-pro' },
        prompt: { type: 'string', description: 'Текст запроса' },
        system: { type: 'string', description: 'Необязательный системный промпт' },
        temperature: { type: 'number', description: 'Температура (0..1)' },
      },
    },
  },
  {
    name: 'compare_models',
    description: 'Параллельно прогоняет один промпт на 2-4 моделях сразу и возвращает сводное сравнение ответов, токенов и задержек.',
    inputSchema: {
      type: 'object',
      required: ['models', 'prompt'],
      properties: {
        models: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
        prompt: { type: 'string' },
      },
    },
  },
  {
    name: 'get_balance',
    description: 'Возвращает текущий рублевый баланс аккаунта по переданному ключу nsr_....',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kwork_benchmark_lookup',
    description: 'Подбирает оптимальную модель под бизнес-задачу (code, text, design, analytics, support) и бюджет (low, mid, high).',
    inputSchema: {
      type: 'object',
      required: ['task'],
      properties: {
        task: { type: 'string', enum: ['code', 'text', 'design', 'analytics', 'support'] },
        budget: { type: 'string', enum: ['low', 'mid', 'high'] },
      },
    },
  },
  {
    name: 'tg_search_posts',
    description: 'Полнотекстовый поиск по базе русскоязычных ИИ- и IT-каналов Telegram (43 800+ постов, очистка от рекламы erid).',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Поисковый запрос (напр. Claude, MCP, OpenRouter, n8n)' },
        days: { type: 'number', description: 'Окно поиска в днях (1..365, по умолчанию 30)' },
        exclude_ads: { type: 'boolean', description: 'Исключить рекламные посты erid (по умолчанию true)' },
        channel: { type: 'string', description: 'Фильтр по username канала без @' },
        limit: { type: 'number', description: 'Число результатов (1..50, по умолчанию 15)' },
      },
    },
  },
  {
    name: 'tg_get_trends',
    description: 'Динамика упоминаний ИИ-моделей и технологий в русскоязычном Telegram по месяцам и за выбранное окно.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Список тем через запятую, напр. claude,openai,deepseek,mcp' },
        window: { type: 'string', description: 'Окно в днях: 30d, 90d, 365d' },
      },
    },
  },
  {
    name: 'tg_ad_radar',
    description: 'Рекламный радар Telegram: топ рекламодателей с развернутыми доменами, посты с маркировкой erid и перехваченные 24ч посевы.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Окно анализа в днях (по умолчанию 30)' },
        domain: { type: 'string', description: 'Фильтр по домену рекламодателя, напр. selectel.ru' },
        only_deleted_24h: { type: 'boolean', description: 'Только удаленные после 24ч посевы' },
      },
    },
  },
  {
    name: 'ru_cbr_rate',
    description: 'Официальные курсы валют ЦБ РФ на любую дату, ключевая ставка ЦБ РФ (2013-2026) и расчет пени/процентов по ст. 395 ГК РФ.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['rates', 'key_rate', 'penalty'], description: 'Режим: rates (валюты), key_rate (ключевая ставка), penalty (расчет пени)' },
        date: { type: 'string', description: 'Дата YYYY-MM-DD (для rates и key_rate)' },
        codes: { type: 'string', description: 'Коды валют через запятую, напр. USD,EUR,CNY' },
        amount: { type: 'number', description: 'Сумма долга в рублях (для mode=penalty)' },
        from: { type: 'string', description: 'Дата начала просрочки YYYY-MM-DD (для mode=penalty)' },
        to: { type: 'string', description: 'Дата окончания просрочки YYYY-MM-DD (для mode=penalty)' },
        penalty_mode: { type: 'string', enum: ['art395', '1_300', '1_150'], description: 'Формула расчета пени' },
      },
    },
  },
  {
    name: 'ru_workdays',
    description: 'Производственный календарь РФ (2020-2027): проверка рабочего/выходного/сокращенного дня и расчет даты через N рабочих дней.',
    inputSchema: {
      type: 'object',
      required: ['date'],
      properties: {
        date: { type: 'string', description: 'Дата YYYY-MM-DD' },
        add_days: { type: 'number', description: 'Если передано ненулевое целое число, сдвигает дату на N рабочих дней' },
      },
    },
  },
  {
    name: 'ru_bic_lookup',
    description: 'Поиск банка РФ по 9-значному БИК или названию/городу (официальный справочник ЦБ РФ ED807, 1 359 банков).',
    inputSchema: {
      type: 'object',
      properties: {
        bic: { type: 'string', description: 'Точный 9-значный БИК, напр. 044525225' },
        q: { type: 'string', description: 'Поиск по названию банка, городу или корсчету' },
      },
    },
  },
  {
    name: 'ru_okved_search',
    description: 'Поиск и расшифровка кодов ОКВЭД-2 (2 770 кодов, 21 раздел) по ключевым словам или точному коду.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Точный код ОКВЭД-2, напр. 62.01 (возвращает карточку и дочерние коды)' },
        q: { type: 'string', description: 'Поиск по названию вида деятельности' },
        section: { type: 'string', description: 'Фильтр по букве раздела (A..U)' },
      },
    },
  },
  {
    name: 'find_mcp_server',
    description: 'Поиск проверенных MCP-серверов, работающих в РФ (1С, Битрикс24, Яндекс, Telegram, AmoCRM, МойСклад, БД) с готовым JSON-конфигом.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Запрос: 1с, битрикс24, яндекс, telegram, postgres, wildberries' },
        category: { type: 'string', description: 'Категория каталога' },
        rf_ok: { type: 'boolean', description: 'Только проверенные для работы в РФ без VPN' },
      },
    },
  },
  {
    name: 'diagnose_llm_error',
    description: 'Диагностика ошибок LLM API (HTTP 401/402/403/429/502, региональные блокировки, таймауты SDK) с пошаговым фиксом и кодом.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Текст ошибки или симптом, напр. 403 region not supported' },
        code: { type: 'string', description: 'Код ошибки, напр. 429 или 401' },
      },
    },
  },
  {
    name: 'ru_company_by_inn',
    description: 'Карточка организации или ИП РФ по ИНН из открытых наборов ФНС: статус МСП, основной ОКВЭД, спецрежим (УСН/ЕСХН), численность, доходы/расходы и массовый адрес.',
    inputSchema: {
      type: 'object',
      required: ['inn'],
      properties: {
        inn: { type: 'string', description: '10-значный ИНН юрлица или 12-значный ИНН ИП' },
      },
    },
  },
  {
    name: 'ru_software_registry_search',
    description: 'Поиск программного обеспечения в Едином реестре российского ПО Минцифры по названию или ИНН правообладателя.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Название ПО или правообладателя' },
        inn: { type: 'string', description: 'ИНН правообладателя' },
        limit: { type: 'number', description: 'Лимит записей (1..50)' },
      },
    },
  },
  {
    name: 'med_drugs_search',
    description: 'Поиск лекарств в ГРЛС Минздрава РФ: торговое наименование, МНН (аналоги), форма выпуска, производитель, статус ЖНВЛП и предельная цена.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Название лекарства или производитель' },
        mnn: { type: 'string', description: 'Международное непатентованное наименование (для подбора аналогов)' },
        znvlp: { type: 'boolean', description: 'Только препараты из перечня ЖНВЛП' },
        limit: { type: 'number', description: 'Лимит записей (1..50)' },
      },
    },
  },
  {
    name: 'med_license_check',
    description: 'Проверка медицинских, фармацевтических и технических лицензий Росздравнадзора по ИНН, названию или региону.',
    inputSchema: {
      type: 'object',
      properties: {
        inn: { type: 'string', description: 'ИНН клиники, аптеки или сервисной компании' },
        q: { type: 'string', description: 'Название организации или вида деятельности' },
        region: { type: 'string', description: 'Субъект РФ' },
      },
    },
  },
  {
    name: 'med_icd10_search',
    description: 'Справочник диагнозов МКБ-10 (НСИ Минздрава РФ, 15 000+ кодов): расшифровка по точному коду или полнотекстовый поиск.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Точный код МКБ-10, напр. J06 или I10' },
        q: { type: 'string', description: 'Полнотекстовый поиск по диагнозу' },
      },
    },
  },
  {
    name: 'ip_trademarks_search',
    description: 'Поиск товарных знаков РФ по открытым данным Роспатента (номер регистрации, правообладатель, ИНН, срок действия, ссылка на ФИПС).',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Название правообладателя или номер регистрации ТЗ' },
        inn: { type: 'string', description: 'ИНН правообладателя' },
        actual_only: { type: 'boolean', description: 'Только действующие ТЗ (по умолчанию true)' },
        well_known: { type: 'boolean', description: 'Только общеизвестные товарные знаки' },
      },
    },
  },
  {
    name: 'ecom_markirovka_check',
    description: 'Проверка обязательной маркировки "Честный ЗНАК" (волны 1-3 легпрома, обувь, косметика, БАД, игрушки) и требований сертификации ТР ТС по коду ТН ВЭД или названию товара.',
    inputSchema: {
      type: 'object',
      properties: {
        tnved: { type: 'string', description: 'Код ТН ВЭД ЕАЭС (4-10 цифр), например 6109100000' },
        q: { type: 'string', description: 'Название товара, например "футболка хлопковая" или "кроссовки"' },
      },
    },
  },
  {
    name: 'ecom_tnved_search',
    description: 'Поиск и подбор кода ТН ВЭД ЕАЭС для товаров легкой промышленности и маркетплейсов (WB/Ozon) с указанием ТР ТС и маркировки Честный ЗНАК.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Поисковый запрос: название товара или префикс ТН ВЭД' },
        limit: { type: 'number', description: 'Лимит записей (1..50)' },
      },
    },
  },
  {
    name: 'construction_contractor_check',
    description: 'Комплексная проверка строительного или проектного подрядчика и УК ЖКХ по ИНН в 1 запрос: живые реестры СРО НОСТРОЙ (422к+) и НОПРИЗ (214к+), ФНС МСП, РНП ФАС и лицензия УК ЖКХ.',
    inputSchema: {
      type: 'object',
      required: ['inn'],
      properties: {
        inn: { type: 'string', description: '10- или 12-значный ИНН подрядчика или УК' },
      },
    },
  },
  {
    name: 'real_estate_search',
    description: 'Поиск новостроек и проблемных ЖК (ЕИСЖС наш.дом.рф), карточка застройщика по ИНН или поиск паспортов многоквартирных домов ГИС ЖКХ.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['projects', 'houses', 'developer'], description: 'Режим: projects (ЖК), houses (паспорта домов), developer (карточка застройщика по ИНН)' },
        q: { type: 'string', description: 'Название ЖК, адрес дома или застройщик' },
        region: { type: 'string', description: 'Регион РФ' },
        city: { type: 'string', description: 'Город (для mode=houses)' },
        developer_inn: { type: 'string', description: 'ИНН застройщика' },
        only_problem: { type: 'boolean', description: 'Только проблемные объекты ЕИСЖС' },
      },
    },
  },
  {
    name: 'real_estate_mortgage_calc',
    description: 'Ипотечный калькулятор РФ (аннуитет или дифференцированный платеж) с привязкой к текущей ключевой ставке ЦБ РФ и сравнением с льготными программами.',
    inputSchema: {
      type: 'object',
      required: ['price'],
      properties: {
        price: { type: 'number', description: 'Стоимость недвижимости в рублях, например 10000000' },
        down_payment: { type: 'number', description: 'Первоначальный взнос в рублях (по умолчанию 0)' },
        years: { type: 'number', description: 'Срок ипотеки в годах (1..40, по умолчанию 20)' },
        rate: { type: 'number', description: 'Годовая ставка в % (если не задана - ключевая ставка ЦБ + 3 п.п.)' },
        mode: { type: 'string', enum: ['annuity', 'differentiated'], description: 'Тип платежа' },
      },
    },
  },
  {
    name: 'ru_market_salaries',
    description: 'Индекс зарплат IT и ИИ-специалистов в РФ (Москва и регионы, Junior/Middle/Senior, тренды спроса и навыки).',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Роль или навык, например llm, python, 1с, n8n, devops' },
        category: { type: 'string', description: 'Категория: ai_ml, backend, frontend, data, automation, product, 1c_enterprise' },
      },
    },
  },
  {
    name: 'ru_freelance_vs_api',
    description: 'Сравнение среднего чека задачи на фриланс-биржах РФ (Kwork/FL) со стоимостью решения через LLM API Нейросети.ру в рублях.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Тип задачи, например договор, карточки, парсер, протокол, поддержка' },
        category: { type: 'string', description: 'Категория: text, code, analytics, support, design, audio' },
      },
    },
  },
  {
    name: 'ru_counterparty_360',
    description: 'Единая 360-проверка российского контрагента (ЮЛ или ИП) по ИНН в 1 запрос сразу по 8 реестрам: ФНС, СРО НОСТРОЙ и НОПРИЗ, РНП ФАС, Росздравнадзор, Роспатент, УК ЖКХ, Реестр ПО и ЕИСЖС.',
    inputSchema: {
      type: 'object',
      required: ['inn'],
      properties: {
        inn: { type: 'string', description: '10- или 12-значный ИНН организации или ИП РФ' },
      },
    },
  },
  {
    name: 'ru_counterparty_batch',
    description:
      'Пакетная 360-проверка от 1 до 10 российских контрагентов (ИНН) за 1 запрос сразу по 8 реестрам РФ (ФНС, СРО НОСТРОЙ/НОПРИЗ, РНП ФАС, Росздравнадзор, Роспатент, УК ЖКХ, Реестр ПО, ЕИСЖС).',
    inputSchema: {
      type: 'object',
      required: ['inns'],
      properties: {
        inns: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10,
          description: 'Список от 1 до 10 уникальных ИНН (10 или 12 цифр)',
        },
        live_sro: {
          type: 'boolean',
          description: 'Делать ли дополнительный живой запрос к API СРО НОСТРОЙ/НОПРИЗ (по умолчанию false, используется быстрый кеш PG)',
        },
      },
    },
  },
  {
    name: 'get_data_quota',
    description: 'Проверка тарифа и остатка суточной квоты Data API по ключу nsr_... (запрос не списывается из лимита).',
    inputSchema: { type: 'object', properties: {} },
  },
];

function buildQuery(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

async function fetchUpstreamJson({ apiBase, apiKey, path, toolName = '', fetchImpl = fetch }) {
  if (!apiKey) throw new Error('Не передан ключ nsr_... в Authorization: Bearer.');
  const res = await fetchImpl(`${apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Neuroseti-Client': `mcp-v${SERVER_VERSION}`,
      ...(toolName ? { 'X-Mcp-Tool': toolName } : {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API HTTP ${res.status}: ${text.slice(0, 320)}`);
  }
  return text;
}

async function postUpstreamJson({ apiBase, apiKey, path, body, toolName = '', fetchImpl = fetch }) {
  if (!apiKey) throw new Error('Не передан ключ nsr_... в Authorization: Bearer.');
  const res = await fetchImpl(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Neuroseti-Client': `mcp-v${SERVER_VERSION}`,
      ...(toolName ? { 'X-Mcp-Tool': toolName } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API HTTP ${res.status}: ${text.slice(0, 320)}`);
  }
  return text;
}

async function callUpstreamChat({ apiBase, apiKey, model, prompt, system, temperature, fetchImpl = fetch }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const t0 = Date.now();
  const res = await fetchImpl(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      ...(typeof temperature === 'number' ? { temperature } : {}),
    }),
  });
  const latencyMs = Date.now() - t0;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const parsed = JSON.parse(text);
  return {
    model,
    latencyMs,
    content: parsed?.choices?.[0]?.message?.content ?? '',
    usage: parsed?.usage ?? null,
  };
}

export const PROMPT_DEFINITIONS = [
  {
    name: 'check_counterparty_rf',
    description: 'Комплексная проверка российского контрагента по ИНН (8 реестров + расшифровка ОКВЭД + итоговое заключение о рисках).',
    arguments: [{ name: 'inn', description: '10- или 12-значный ИНН организации или ИП РФ', required: true }],
  },
  {
    name: 'check_wb_ozon_product',
    description: 'Чеклист вывода товара на Wildberries и Ozon: ТН ВЭД, маркировка Честный ЗНАК, сертификация ТР ТС и проверка товарного знака.',
    arguments: [{ name: 'product', description: 'Название товара на русском (например, футболка хлопковая)', required: true }],
  },
  {
    name: 'audit_drug_znvlp',
    description: 'Проверка лекарства по ГРЛС Минздрава РФ, подбор аналогов по МНН и сравнение предельных цен ЖНВЛП.',
    arguments: [{ name: 'drug_name', description: 'Торговое наименование или МНН препарата', required: true }],
  },
  {
    name: 'calc_debt_penalty_rf',
    description: 'Расчет процентов по ст. 395 ГК РФ / пени по ключевой ставке ЦБ с учетом рабочих дней РФ и черновиком претензии.',
    arguments: [
      { name: 'amount', description: 'Сумма долга в рублях', required: true },
      { name: 'from', description: 'Дата начала просрочки YYYY-MM-DD', required: true },
      { name: 'to', description: 'Дата окончания просрочки YYYY-MM-DD', required: true },
    ],
  },
  {
    name: 'pick_best_llm_rf',
    description: 'Подбор лучшей LLM для задачи в РФ с таблицей цен в рублях (Эконом и Официальный каналы) и оценкой экономии против фриланса.',
    arguments: [
      { name: 'task', description: 'Тип задачи: code, text, design, analytics или support', required: true },
      { name: 'budget', description: 'Бюджет: low, mid или high', required: false },
    ],
  },
];

export const RESOURCE_DEFINITIONS = [
  {
    uri: 'neuroseti://stats',
    name: 'Live RF Open Data Stats',
    description: 'Живые счетчики строк в открытых реестрах PostgreSQL Нейросети.ру (ФНС, ГРЛС, Роспатент, СРО, МКБ-10, Telegram).',
    mimeType: 'application/json',
  },
  {
    uri: 'neuroseti://openapi',
    name: 'Neuroseti.ru OpenAPI 3.1 Spec',
    description: 'Полная машиночитаемая OpenAPI 3.1 спецификация всех Data API маршрутов.',
    mimeType: 'application/json',
  },
  {
    uri: 'neuroseti://llms-full',
    name: 'Neuroseti.ru Full LLM Reference',
    description: 'Полный справочник всех 30 MCP-инструментов и REST-эндпоинтов для ИИ-агентов.',
    mimeType: 'text/markdown',
  },
];

function buildPromptMessages(name, args = {}) {
  if (name === 'check_counterparty_rf') {
    const inn = String(args.inn || '').trim() || '7705552444';
    return {
      description: `Проверка контрагента РФ по ИНН ${inn}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Проверь российского контрагента с ИНН ${inn}: 1) вызови ru_counterparty_360(inn="${inn}"), 2) если найден okved_main, расшифруй его через ru_okved_search, 3) выдай структурированное заключение: название, статус МСП и налоги, членство в СРО, РНП, лицензии, товарные знаки и итоговый уровень риска.`,
          },
        },
      ],
    };
  }
  if (name === 'check_wb_ozon_product') {
    const product = String(args.product || '').trim() || 'футболка хлопковая';
    return {
      description: `Чеклист запуска товара «${product}» на WB/Ozon`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Подготовь чеклист запуска товара «${product}» на WB и Ozon: вызови ecom_tnved_search(q="${product}"), ecom_markirovka_check(q="${product}") и при необходимости ip_trademarks_search. Укажи код ТН ВЭД, нужна ли маркировка Честный ЗНАК (волна и ПП РФ) и какой документ ТР ТС требуется.`,
          },
        },
      ],
    };
  }
  if (name === 'audit_drug_znvlp') {
    const drug = String(args.drug_name || '').trim() || 'ибупрофен';
    return {
      description: `Аудит препарата «${drug}» по ГРЛС и ЖНВЛП`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Найди препарат «${drug}» через med_drugs_search(q="${drug}"), затем подбери аналоги по его МНН (znvlp=true) и оформи таблицу со статусом ЖНВЛП и предельными ценами в рублях. Обязательно сохрани медицинский дисклеймер.`,
          },
        },
      ],
    };
  }
  if (name === 'calc_debt_penalty_rf') {
    const amount = args.amount || '100000';
    const from = args.from || '2026-06-01';
    const to = args.to || '2026-08-31';
    return {
      description: `Расчет процентов по ст. 395 ГК РФ (${amount} руб.)`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Рассчитай проценты по ст. 395 ГК РФ на сумму ${amount} руб. за период с ${from} по ${to} через ru_cbr_rate(mode="penalty", amount=${amount}, from="${from}", to="${to}", penalty_mode="art395"), проверь дату окончания по ru_workdays и оформи краткую таблицу расчета по периодам ключевой ставки ЦБ.`,
          },
        },
      ],
    };
  }
  if (name === 'pick_best_llm_rf') {
    const task = args.task || 'code';
    const budget = args.budget || 'mid';
    return {
      description: `Подбор LLM в РФ для задачи ${task}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Подбери оптимальную LLM в РФ для задачи "${task}" (бюджет "${budget}"): вызови kwork_benchmark_lookup(task="${task}", budget="${budget}"), list_models(category="llm") и ru_freelance_vs_api. Сравни единые цены в рублях по курсу ЦБ и оцени экономию.`,
          },
        },
      ],
    };
  }
  return null;
}

export async function handleRpcMessage(msg, { apiKey, apiBase = DEFAULT_API_BASE, fetchImpl = fetch }) {
  const { id, method, params } = msg;
  if (method === 'notifications/initialized') return null;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: 'neuroseti-mcp', version: SERVER_VERSION },
      },
    };
  }

  if (method === 'prompts/list') {
    return { jsonrpc: '2.0', id, result: { prompts: PROMPT_DEFINITIONS } };
  }

  if (method === 'prompts/get') {
    const promptObj = buildPromptMessages(params?.name, params?.arguments);
    if (!promptObj) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown prompt: ${params?.name}` } };
    }
    return { jsonrpc: '2.0', id, result: promptObj };
  }

  if (method === 'resources/list') {
    return { jsonrpc: '2.0', id, result: { resources: RESOURCE_DEFINITIONS } };
  }

  if (method === 'resources/read') {
    const uri = String(params?.uri || '');
    const origin = apiBase.replace(/\/api\/v1$/, '').replace(/\/v1$/, '');
    const targetMap = {
      'neuroseti://stats': { url: `${origin}/api/open-data/stats`, mimeType: 'application/json' },
      'neuroseti://openapi': { url: `${origin}/openapi.json`, mimeType: 'application/json' },
      'neuroseti://llms-full': { url: `${origin}/llms-full.txt`, mimeType: 'text/markdown' },
    };
    const target = targetMap[uri];
    if (!target) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown resource URI: ${uri}` } };
    }
    try {
      const res = await fetchImpl(target.url, { headers: { 'User-Agent': `neuroseti-mcp/${SERVER_VERSION}` } });
      const text = await res.text();
      if (!res.ok) throw new Error(`Resource HTTP ${res.status}`);
      return { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: target.mimeType, text }] } };
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32000, message: String(err.message || err) } };
    }
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOL_DEFINITIONS } };
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    const callUpstreamJson = (opts) => fetchUpstreamJson({ ...opts, toolName: opts.toolName || String(name || '') });

    try {
      if (name === 'list_models') {
        const qs = buildQuery({
          category: args.category,
          vendor: args.vendor,
          routed_only: args.routed_only,
          max_input_rub: args.max_input_rub,
          channel: args.channel,
          q: args.q,
        });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/models${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'get_model_info') {
        if (!args.id) throw new Error('Укажите обязательный параметр id модели.');
        const text = await callUpstreamJson({
          apiBase,
          apiKey,
          path: `/data/models/${encodeURIComponent(String(args.id))}`,
          fetchImpl,
        });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'kwork_benchmark_lookup') {
        const qs = buildQuery({ task: args.task, budget: args.budget });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/models/recommend${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'get_balance') {
        const text = await callUpstreamJson({ apiBase, apiKey, path: '/balance', fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ask_model') {
        if (!apiKey) throw new Error('Не передан ключ nsr_... в Authorization: Bearer.');
        const out = await callUpstreamChat({
          apiBase,
          apiKey,
          model: args.model,
          prompt: args.prompt,
          system: args.system,
          temperature: args.temperature,
          fetchImpl,
        });
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] },
        };
      }

      if (name === 'compare_models') {
        if (!apiKey) throw new Error('Не передан ключ nsr_... в Authorization: Bearer.');
        const list = Array.isArray(args.models) ? args.models.slice(0, 4) : [];
        if (list.length < 2) throw new Error('Передайте от 2 до 4 моделей в массиве models.');
        const settled = await Promise.all(
          list.map((model) =>
            callUpstreamChat({ apiBase, apiKey, model, prompt: args.prompt, fetchImpl }).catch((err) => ({
              model,
              error: err.message,
            })),
          ),
        );
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify({ comparisons: settled }, null, 2) }] },
        };
      }

      if (name === 'tg_search_posts') {
        const qs = buildQuery({
          q: args.q,
          days: args.days,
          exclude_ads: args.exclude_ads,
          channel: args.channel,
          limit: args.limit,
        });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/tg/search${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'tg_get_trends') {
        const qs = buildQuery({ entity: args.entity, window: args.window });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/tg/trends${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'tg_ad_radar') {
        const qs = buildQuery({
          days: args.days,
          domain: args.domain,
          only_deleted_24h: args.only_deleted_24h,
        });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/tg/ads${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_cbr_rate') {
        const mode = args.mode || 'rates';
        let path;
        if (mode === 'key_rate') {
          path = `/data/ru/cbr/key-rate${buildQuery({ date: args.date })}`;
        } else if (mode === 'penalty') {
          path = `/data/ru/finance/penalty${buildQuery({
            amount: args.amount,
            from: args.from,
            to: args.to,
            mode: args.penalty_mode || 'art395',
          })}`;
        } else {
          path = `/data/ru/cbr/rates${buildQuery({ date: args.date, code: args.codes })}`;
        }
        const text = await callUpstreamJson({ apiBase, apiKey, path, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_workdays') {
        if (!args.date) throw new Error('Укажите дату date в формате YYYY-MM-DD.');
        const hasDelta = typeof args.add_days === 'number' && args.add_days !== 0;
        const path = hasDelta
          ? `/data/ru/calendar/add-workdays${buildQuery({ date: args.date, days: args.add_days })}`
          : `/data/ru/calendar/check${buildQuery({ date: args.date })}`;
        const text = await callUpstreamJson({ apiBase, apiKey, path, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_bic_lookup') {
        const path = args.bic
          ? `/data/ru/cbr/bic/${encodeURIComponent(String(args.bic))}`
          : `/data/ru/cbr/bic${buildQuery({ q: args.q })}`;
        const text = await callUpstreamJson({ apiBase, apiKey, path, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_okved_search') {
        const path = args.code
          ? `/data/ru/okved/${encodeURIComponent(String(args.code))}`
          : `/data/ru/okved/search${buildQuery({ q: args.q, section: args.section })}`;
        const text = await callUpstreamJson({ apiBase, apiKey, path, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'find_mcp_server') {
        const qs = buildQuery({ q: args.q, category: args.category, rf_ok: args.rf_ok });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/mcp/search${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'diagnose_llm_error') {
        const qs = buildQuery({ q: args.q, code: args.code });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/errors/search${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_company_by_inn') {
        if (!args.inn) throw new Error('Укажите обязательный параметр inn.');
        const text = await callUpstreamJson({
          apiBase,
          apiKey,
          path: `/data/ru/company/${encodeURIComponent(String(args.inn))}`,
          fetchImpl,
        });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_software_registry_search') {
        const qs = buildQuery({ q: args.q, inn: args.inn, limit: args.limit });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/ru/software-registry/search${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'med_drugs_search') {
        const qs = buildQuery({ q: args.q, mnn: args.mnn, znvlp: args.znvlp, limit: args.limit });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/med/drugs/search${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'med_license_check') {
        const qs = buildQuery({ inn: args.inn, q: args.q, region: args.region });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/med/licenses${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'med_icd10_search') {
        const path = args.code
          ? `/data/med/icd10/${encodeURIComponent(String(args.code))}`
          : `/data/med/icd10/search${buildQuery({ q: args.q })}`;
        const text = await callUpstreamJson({ apiBase, apiKey, path, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ip_trademarks_search') {
        const qs = buildQuery({
          q: args.q,
          inn: args.inn,
          actual_only: args.actual_only,
          well_known: args.well_known,
        });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/ip/trademarks/search${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ecom_markirovka_check') {
        const qs = buildQuery({ tnved: args.tnved, q: args.q });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/ecom/markirovka/check${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ecom_tnved_search') {
        const qs = buildQuery({ q: args.q, limit: args.limit });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/ecom/tnved/search${qs}`, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'construction_contractor_check') {
        if (!args.inn) throw new Error('Укажите обязательный параметр inn.');
        const text = await callUpstreamJson({
          apiBase,
          apiKey,
          path: `/data/construction/contractor/${encodeURIComponent(String(args.inn))}`,
          fetchImpl,
        });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'real_estate_search') {
        const mode = args.mode || (args.developer_inn && !args.q && !args.region ? 'developer' : 'projects');
        let path;
        if (mode === 'developer') {
          if (!args.developer_inn) throw new Error('Для mode=developer укажите developer_inn.');
          path = `/data/real-estate/developers/${encodeURIComponent(String(args.developer_inn))}`;
        } else if (mode === 'houses') {
          path = `/data/real-estate/houses/search${buildQuery({ q: args.q, region: args.region, city: args.city })}`;
        } else {
          path = `/data/real-estate/projects${buildQuery({
            q: args.q,
            region: args.region,
            developer_inn: args.developer_inn,
            only_problem: args.only_problem,
          })}`;
        }
        const text = await callUpstreamJson({ apiBase, apiKey, path, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'real_estate_mortgage_calc') {
        if (!args.price) throw new Error('Укажите обязательный параметр price.');
        const qs = buildQuery({
          price: args.price,
          down_payment: args.down_payment ?? 0,
          years: args.years ?? 20,
          rate: args.rate,
          mode: args.mode,
        });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/real-estate/mortgage-calc${qs}`, toolName: name, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_market_salaries') {
        const qs = buildQuery({ role: args.role, category: args.category });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/market/salaries${qs}`, toolName: name, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_freelance_vs_api') {
        const qs = buildQuery({ task: args.task, category: args.category });
        const text = await callUpstreamJson({ apiBase, apiKey, path: `/data/market/freelance-vs-api${qs}`, toolName: name, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_counterparty_360') {
        if (!args.inn) throw new Error('Укажите обязательный параметр inn.');
        const text = await callUpstreamJson({
          apiBase,
          apiKey,
          path: `/data/ru/counterparty/${encodeURIComponent(String(args.inn))}`,
          toolName: name,
          fetchImpl,
        });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'ru_counterparty_batch') {
        const inns = Array.isArray(args.inns) ? args.inns.map((x) => String(x || '').trim()).filter(Boolean) : [];
        if (inns.length === 0 || inns.length > 10) {
          throw new Error('Передайте массив inns от 1 до 10 ИНН РФ.');
        }
        const text = await postUpstreamJson({
          apiBase,
          apiKey,
          path: '/data/ru/counterparty/batch',
          body: { inns, live_sro: Boolean(args.live_sro) },
          toolName: name,
          fetchImpl,
        });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      if (name === 'get_data_quota') {
        const text = await callUpstreamJson({ apiBase, apiKey, path: '/data/quota', toolName: name, fetchImpl });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: { isError: true, content: [{ type: 'text', text: String(err.message || err) }] },
      };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export function createMcpHttpServer({ apiBase = DEFAULT_API_BASE, requireKeyFormat = true, fetchImpl = fetch } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'neuroseti-mcp',
          version: SERVER_VERSION,
          tools: TOOL_DEFINITIONS.length,
          prompts: PROMPT_DEFINITIONS.length,
          resources: RESOURCE_DEFINITIONS.length,
          models: 94,
          llm_models: 60,
          media_models: 34,
        }),
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/.well-known/mcp.json') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=3600',
      });
      res.end(
        JSON.stringify({
          schemaVersion: '1.0',
          id: 'ru.neuroseti/mcp',
          name: 'Neuroseti.ru MCP Server (RF AI & Open Data)',
          version: SERVER_VERSION,
          homepage: 'https://neuroseti.ru/mcp',
          documentation: 'https://neuroseti.ru/open-api',
          llmsTxt: 'https://neuroseti.ru/llms-full.txt',
          openapi: 'https://neuroseti.ru/openapi.json',
          transport: { type: 'streamable-http', url: 'https://mcp.neuroseti.ru/mcp' },
          authentication: { type: 'bearer', signupUrl: 'https://neuroseti.ru/account' },
          tools: TOOL_DEFINITIONS.map((t) => ({ name: t.name, description: t.description })),
          prompts: PROMPT_DEFINITIONS.map((p) => ({ name: p.name, description: p.description })),
          resources: RESOURCE_DEFINITIONS.map((r) => ({ uri: r.uri, name: r.name, mimeType: r.mimeType })),
        }),
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/mcp') {
      const auth = req.headers.authorization || '';
      const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
      const apiKey = m ? m[1] : null;
      if (!apiKey || (requireKeyFormat && !KEY_PATTERN.test(apiKey))) {
        res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'unauthorized', message: 'Передайте валидный ключ Authorization: Bearer nsr_...' }));
        return;
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        return;
      }

      const reply = await handleRpcMessage(payload, { apiKey, apiBase, fetchImpl });
      if (reply === null) {
        res.writeHead(202);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(reply));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
}

async function runStdio() {
  const apiKey = process.env.NEUROSETI_API_KEY?.trim() || null;
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const reply = await handleRpcMessage(msg, { apiKey, apiBase: DEFAULT_API_BASE });
      if (reply !== null) process.stdout.write(`${JSON.stringify(reply)}\n`);
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`,
      );
    }
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const forceHttp = process.argv.includes('--http') || Boolean(process.env.PORT || process.env.MCP_PORT);
  const wantStdio = process.argv.includes('--stdio') || (!forceHttp && Boolean(process.env.NEUROSETI_API_KEY));
  if (wantStdio) {
    runStdio();
  } else {
    const port = Number(process.env.PORT || process.env.MCP_PORT || 3121);
    const host = process.env.MCP_HOST || '0.0.0.0';
    const srv = createMcpHttpServer();
    srv.listen(port, host, () => {
      console.log(`neuroseti-mcp v${SERVER_VERSION} listening on http://${host}:${port}/mcp (health: /health)`);
    });
  }
}
