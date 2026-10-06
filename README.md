# vscode-bsl-ls-gif-recorder

Стенд для автоматической записи демо-GIF возможностей
[BSL Language Server](https://github.com/1c-syntax/bsl-language-server): автодополнение, hover,
переход к определению, поиск ссылок, иерархии, форматирование и т.д. Запись идёт в браузерном
VS Code ([code-server](https://github.com/coder/code-server)), управляемом
[Playwright](https://playwright.dev/), без участия человека.

*Scenario-driven GIF recorder for BSL Language Server features (code-server + Playwright).*

Результат работы — каталог возможностей в [`capabilities/`](capabilities/index.md) (RU) и
[`en/capabilities/`](en/capabilities/index.md) (EN).

## Как это устроено

- **Сценарий** — JSON в `scenarios/`: содержимое фикстуры, файл, который нужно открыть, и шаги
  (`goto`, `type`, `suggest`, `hover`, `peek`, `command`, `shot`…). Новый сценарий добавляется
  новым JSON, код движка менять не нужно.
- **Движок** (`engine.mjs`) открывает code-server в headless Chromium и ждёт, пока LS закончит
  наполнять контекст. Готовность определяется по статус-бару, а не по таймеру. Затем движок
  выполняет шаги и пишет видео, а `ffmpeg` превращает его в GIF.
- `record.mjs` записывает один сценарий, `record-session.mjs` — группу сценариев из `sessions/`
  за один прогрев LS.
- **Воркспейсы** в `workspace/`: синтетический `bsl-demo`, OneScript-проект `oscript-demo`, а для
  межмодульной навигации — реальная конфигурация
  [БСП 3.2](https://github.com/1c-syntax/ssl_3_2). Она подключена сабмодулем `vendor/ssl_3_2`.
- `build-doc.mjs` собирает каталог из `features.json`, `descriptions.json` и сценариев. GIF
  подставляются по публичным ссылкам из `gif-urls.json`, поэтому сами GIF в репозиторий не
  попадают.

## Требования

- Linux (x64 или arm64), Docker, Node.js ≥ 20, `ffmpeg`, `git`, `curl`.
- Python 3 — только для LSP-проб в `tools/probes/`.
- Желательно установленная платформа 1С:Предприятие. Из неё берутся файлы синтакс-помощника
  (`sh*.hbk`), и тогда hover и автодополнение платформенных методов выглядят полноценно. Это
  проприетарные файлы, поэтому в репозиторий они не входят и копируются из вашей установки.

## Быстрый старт

```bash
git clone --recurse-submodules https://github.com/1c-syntax/vscode-bsl-ls-gif-recorder.git
cd vscode-bsl-ls-gif-recorder
scripts/setup.sh              # JRE 25, jar LS, HBK, расширения code-server, Playwright
scripts/start-codeserver.sh   # code-server на http://127.0.0.1:8090

node record.mjs scenarios/hover-01-method.json                              # один сценарий → output/
timeout 900 node record-session.mjs sessions/bsl-demo.json > s.log 2>&1     # группа
node build-doc.mjs                                                          # каталог
```

Параметры `setup.sh`:

- `BSL_LS_JAR=/path/to/*-exec.jar` — взять свою сборку LS, например develop, вместо последнего
  релиза.
- `V8_BIN=/opt/1cv8/x86_64/<версия>` — каталог платформы с HBK.

Если code-server слушает другой адрес, его задаёт переменная `CODE_SERVER_URL`.

## Важно

- **Java 25.** На Java 21 LS не читает конфигурацию БСП, поэтому стенд использует Temurin 25 из
  `work/jre25`.
- **БСП запинена** на коммите `4a4513f8`. Сценарии переходят к определениям по жёстко заданным
  позициям `строка:колонка`. Если обновить сабмодуль, все переходы промахнутся.

Подробности — в [`RUNBOOK.md`](RUNBOOK.md): справочник шагов и полей сценария, устройство
воркспейсов, загрузка GIF на CDN, troubleshooting.

## Структура

| Путь | Что |
|---|---|
| `scenarios/`, `sessions/` | сценарии и их группы |
| `engine.mjs`, `record*.mjs` | движок записи |
| `build-doc.mjs`, `build-html.mjs`, `build-pdf.mjs` | каталог в Markdown / HTML-архив с анимацией / PDF |
| `features.json`, `descriptions.json`, `gif-urls.json` | данные каталога |
| `capabilities/`, `en/capabilities/` | сгенерированный каталог |
| `workspace/` | фикстуры и демо-проекты (монтируются в контейнер) |
| `vendor/ssl_3_2` | сабмодуль БСП |
| `config/User/settings.json` | настройки code-server для записи |
| `tools/probes/` | LSP-пробы без браузера ([README](tools/probes/README.md)) |
| `docs/notes/` | заметки по найденным особенностям LS |
| `AGENTS.md`, `.claude/skills/` | инструкции для AI-агентов |

## Лицензия

[MIT](LICENSE). БСП (`vendor/ssl_3_2`) распространяется под
[CC BY 4.0](https://github.com/1c-syntax/ssl_3_2/blob/develop/LICENSE.md). Расширения code-server,
JRE и BSL Language Server скачиваются при установке и распространяются под собственными
лицензиями.
