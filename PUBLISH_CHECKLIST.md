# Чеклист публикации открытого репозитория `neuroseti-mcp`

Репозиторий `C:\Projects\neuroseti-mcp` не содержит секретов, ПДн и закрытого кода основного сайта `neuroseti.ru`. Его можно безопасно выкладывать в публичный GitHub и пакетные реестры.

## Шаг 1. Публичный GitHub-репозиторий (уже опубликован)

Репозиторий `https://github.com/vitaliyino/neuroseti-mcp` создан и синхронизирован с `main`.

## Шаг 2. Опубликовать `@neuroseti/mcp` в npm

После публикации любой пользователь и агент сможет подключать сервер одной командой `npx -y @neuroseti/mcp`.

```powershell
cd C:\Projects\neuroseti-mcp
npm login
npm publish --access public
```

## Шаг 3. Зарегистрировать в Official MCP Registry (`registry.modelcontextprotocol.io`)

Официальный реестр автоматически переиндексируется каталогами Cursor, VS Code, Smithery, Glama и PulseMCP.

1. Установите `mcp-publisher` (https://github.com/modelcontextprotocol/registry).
2. Пройдите DNS-подтверждение пространства имен `ru.neuroseti` (TXT-запись в Cloudflare) или используйте `io.github.vitaliyino/neuroseti-mcp` через GitHub OAuth.
3. Выполните:

```bash
mcp-publisher login dns --domain neuroseti.ru
mcp-publisher publish server.json
```

## Шаг 4. Добавить в каталоги MCP (5 минут)

- Smithery (`https://smithery.ai`): подключить GitHub-репозиторий `vitaliyino/neuroseti-mcp` (файл `smithery.yaml` уже готов).
- Glama (`https://glama.ai/mcp/servers`): добавить URL репозитория (`glama.json` и `Dockerfile` уже готовы).
- PulseMCP (`https://www.pulsemcp.com/submit`): отправить URL репозитория и `https://mcp.neuroseti.ru/mcp`.
- PR в `https://github.com/punkpeye/awesome-mcp-servers` (раздел Finance / Open Data).

## Шаг 5. Опубликовать Python SDK `neuroseti-data` в PyPI

```powershell
cd C:\Projects\neuroseti-mcp\python
python -m pip install --upgrade build twine
python -m build
python -m twine upload dist/*
```

## Автопубликация по тегу `v*` (GitHub Actions)

В `.github/workflows/publish.yml` настроен автовыпуск в npm и PyPI при пуше тега `v*` (например, `v0.7.0`). Достаточно добавить `NPM_TOKEN` и `PYPI_TOKEN` в `Settings -> Secrets and variables -> Actions` репозитория `vitaliyino/neuroseti-mcp`.
