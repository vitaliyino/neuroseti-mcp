# Neuroseti.ru MCP Server & Open Data SDK (`@neuroseti/mcp`)

Official open-source **Model Context Protocol (MCP)** server (`v0.8.0`, **31 tools, 5 MCP Prompts, 3 MCP Resources**) and zero-dependency **JavaScript/TypeScript + Python SDK** (`@neuroseti/mcp/sdk`, `neuroseti-data`) for Russian open government registries, 360-degree & batch counterparty INN checks, AI Telegram analytics, and 33 LLMs billed in RUB.

- Live Remote MCP (Streamable HTTP): `https://mcp.neuroseti.ru/mcp`
- Free API Key (`300 requests/day`, no credit card): https://neuroseti.ru/account
- OpenAPI 3.1 Spec: https://neuroseti.ru/openapi.json
- LLM Docs (`llms-full.txt`): https://neuroseti.ru/llms-full.txt
- MCP Server Card: https://neuroseti.ru/.well-known/mcp.json
- Russian README: [README.ru.md](./README.ru.md)

## Quick Connect (1 minute)

### 1. Remote Streamable HTTP (Cursor, Claude Code, Windsurf, VS Code)

```json
{
  "mcpServers": {
    "neuroseti": {
      "url": "https://mcp.neuroseti.ru/mcp",
      "headers": {
        "Authorization": "Bearer nsr_YOUR_KEY"
      }
    }
  }
}
```

Claude Code CLI:

```bash
claude mcp add --transport http neuroseti https://mcp.neuroseti.ru/mcp --header "Authorization: Bearer nsr_YOUR_KEY"
```

### 2. Local stdio via `npx` (Claude Desktop, Smithery, Glama)

```json
{
  "mcpServers": {
    "neuroseti": {
      "command": "npx",
      "args": ["-y", "@neuroseti/mcp"],
      "env": {
        "NEUROSETI_API_KEY": "nsr_YOUR_KEY"
      }
    }
  }
}
```

### 3. JavaScript / TypeScript SDK (Zero dependencies)

```js
import { NeurosetiDataClient } from '@neuroseti/mcp/sdk';

const client = new NeurosetiDataClient({ apiKey: 'nsr_YOUR_KEY' });
console.log(await client.checkMarkirovka({ q: 'футболка' }));
console.log(await client.checkContractor('5047176993'));
console.log(await client.checkCounterpartyBatch(['7705552444', '5047176993']));
```

### 4. Python SDK (OpenAI Agents / LangChain / Scripts)

```bash
pip install neuroseti-data
```

```python
from neuroseti_data import NeurosetiDataClient

client = NeurosetiDataClient(api_key="nsr_YOUR_KEY")
print(client.check_markirovka(q="футболка"))
print(client.check_contractor("5047176993"))
print(client.check_counterparty_batch(["7705552444", "5047176993"]))
print(client.search_drugs(q="ибупрофен", znvlp=True))
```

### 5. Drop-in Cursor Rule & Claude Code Plugin

- **Cursor Rule:** copy [plugins/cursor-rules/neuroseti-rf-open-data.mdc](./plugins/cursor-rules/neuroseti-rf-open-data.mdc) into `.cursor/rules/` in your project so Cursor automatically routes RF INN, CBR, Chestny ZNAK, GRLS and SRO questions to live Neuroseti MCP tools.
- **Claude Code Plugin:** manifest provided in [.claude-plugin/plugin.json](./.claude-plugin/plugin.json) (uses `NEUROSETI_API_KEY` env var).

## All 31 MCP Tools

| Category | Tools | Live Data Coverage |
| :--- | :--- | :--- |
| LLM Routing & Balance (6) | `list_models`, `get_model_info`, `ask_model`, `compare_models`, `get_balance`, `kwork_benchmark_lookup` | 33 LLMs + 18 media models, live CBR RUB prices, economy & enterprise channels |
| Counterparty 360 & Quota (3) | `ru_counterparty_360`, `ru_counterparty_batch`, `get_data_quota` | Single & batch (1-10 INNs) 8-registry check (FNS, SRO, Rospatent, Roszdravnadzor, RNP, UK, Software, EISZS) + zero-cost quota check |
| AI Telegram Pulse (3) | `tg_search_posts`, `tg_get_trends`, `tg_ad_radar` | 43,965+ posts across 40 Russian AI/IT channels, `erid` ad filtering, 24h ad watch |
| Business & Finance RF (6) | `ru_cbr_rate`, `ru_workdays`, `ru_bic_lookup`, `ru_okved_search`, `ru_company_by_inn`, `ru_software_registry_search` | CBR FX/key-rate/Art.395 penalty, 1,359 BICs, 2020-2027 calendar, 2,770 OKVED-2, 100,000+ FNS INN cards |
| Healthcare & IP (4) | `med_drugs_search`, `med_license_check`, `med_icd10_search`, `ip_trademarks_search` | 35,987 active GRLS drugs, 23,966 Roszdravnadzor licenses, 15,038 ICD-10 codes, 30,278 Rospatent trademarks |
| E-Com, Construction & Real Estate (5) | `ecom_markirovka_check`, `ecom_tnved_search`, `construction_contractor_check`, `real_estate_search`, `real_estate_mortgage_calc` | Chestny ZNAK waves 1-3 + TR TS matrix, live SRO NOSTROY/NOPRIZ + FNS + RNP, EISZS/GIS ZKH, CBR mortgage calc |
| IT/AI Market & Discovery (4) | `ru_market_salaries`, `ru_freelance_vs_api`, `find_mcp_server`, `diagnose_llm_error` | RF IT/AI salary medians, freelance-vs-API ROI, 36 RF MCP servers, LLM error guides |

## MCP Prompts (5) & Resources (3)

- **Prompts:** `check_counterparty_rf`, `check_wb_ozon_product`, `audit_drug_znvlp`, `calc_debt_penalty_rf`, `pick_best_llm_rf`.
- **Resources:** `neuroseti://stats` (live DB counts), `neuroseti://openapi` (OpenAPI 3.1 spec), `neuroseti://llms-full` (full technical reference).

## Local Development & Tests

```bash
npm test
PYTHONPATH=python/src python -m unittest discover -s python/tests -p "test_*.py" -v
```

## License

MIT
