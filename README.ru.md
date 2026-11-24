# MCP-сервер и Python SDK Нейросети.ру (`@neuroseti/mcp`)

Открытый MCP-сервер (`v0.6.0`, **30 инструментов**) и SDK для JavaScript/TypeScript и Python (`@neuroseti/mcp/sdk`, `neuroseti-data`) без внешних зависимостей для работы ИИ-агентов с российскими открытыми госреестрами, проверкой контрагента 360 по ИНН, ИИ-Telegram и 33 LLM в рублях.

- Облачный MCP-сервер (Streamable HTTP): `https://mcp.neuroseti.ru/mcp`
- Бесплатный ключ `nsr_...` (300 запросов/сутки без карты): https://neuroseti.ru/account
- OpenAPI 3.1: https://neuroseti.ru/openapi.json
- Полный справочник для LLM: https://neuroseti.ru/llms-full.txt
- Карточка обнаружения MCP: https://neuroseti.ru/.well-known/mcp.json

## Подключение за 1 минуту

### Cursor / Claude Code / Windsurf / VS Code (удаленный Streamable HTTP)

```json
{
  "mcpServers": {
    "neuroseti": {
      "url": "https://mcp.neuroseti.ru/mcp",
      "headers": {
        "Authorization": "Bearer nsr_ВАШ_КЛЮЧ"
      }
    }
  }
}
```

### Локальный запуск через `npx` (stdio)

```json
{
  "mcpServers": {
    "neuroseti": {
      "command": "npx",
      "args": ["-y", "@neuroseti/mcp"],
      "env": {
        "NEUROSETI_API_KEY": "nsr_ВАШ_КЛЮЧ"
      }
    }
  }
}
```

### Python SDK (скрипты, Telegram-боты, OpenAI SDK, LangChain)

```python
from neuroseti_data import NeurosetiDataClient

client = NeurosetiDataClient(api_key="nsr_ВАШ_КЛЮЧ")
print(client.check_markirovka(q="футболка"))
print(client.check_contractor("5047176993"))
print(client.search_drugs(q="ибупрофен", znvlp=True))
print(client.get_market_salaries(role="llm"))
```

## Что входит в 28 инструментов

- 33 LLM и 18 медиа-моделей с живыми ценами в рублях по курсу ЦБ (`list_models`, `ask_model`, `compare_models`).
- Поиск и тренды по 43 965+ постам ИИ-Telegram без рекламы `erid` (`tg_search_posts`, `tg_get_trends`, `tg_ad_radar`).
- Бизнес и финансы РФ: курсы/ключевая ставка ЦБ, пени ст. 395 ГК, 1 359 БИК, календарь РФ 2020-2027, 2 770 ОКВЭД-2, 100 000+ карточек ФНС по ИНН.
- Медицина и ИС: 35 987 действующих лекарств ГРЛС (МНН и ЖНВЛП), 23 966 лицензий Росздравнадзора, 15 038 кодов МКБ-10, 30 278 товарных знаков Роспатента.
- Селлеры WB/Ozon и легпром: ТН ВЭД ЕАЭС, все 3 волны «Честный ЗНАК» и матрица ТР ТС (`ecom_markirovka_check`, `ecom_tnved_search`).
- Стройка, ЖКХ и недвижимость: проверка подрядчика по ИНН (живые СРО НОСТРОЙ/НОПРИЗ + ФНС + РНП ФАС + УК), ЕИСЖС, дома ГИС ЖКХ, ипотечный калькулятор ЦБ.
- Рынок труда IT/ИИ и каталог MCP: медианы зарплат РФ, фриланс против API, каталог 36 MCP-серверов для РФ и база ошибок LLM API.

Лицензия: MIT.
