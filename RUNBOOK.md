# RUNBOOK — запись демо-GIF провайдеров BSL Language Server

Стенд для автоматической записи GIF работы `bsl-language-server` (автодополнение,
hover, go-to-definition и т.д.) в **браузерном VSCode** (`code-server`), управляемом
**Playwright**. Запись сценарно-управляемая: один движок `record.mjs` + по JSON-файлу
на каждый сценарий. Под 10+ сценариев автодополнения = 10+ JSON, код не трогаем.

Все пути ниже — относительно корня репозитория. Первичная установка — `scripts/setup.sh`
(см. README.md).

> Для агента: этот файл — источник правды. Прежде чем записывать демо,
> прочитай его целиком (краткая выжимка — `AGENTS.md`).

---

## TL;DR — записать сценарии

```bash
# контейнер должен быть поднят: scripts/start-codeserver.sh (см. ниже).

# один сценарий:
node record.mjs scenarios/01-global-functions.json

# ЦЕЛАЯ ГРУППА за один прогрев LS (быстро!) — см. «Сессия-раннер»:
timeout 900 node record-session.mjs sessions/bsl-demo.json > /tmp/s.log 2>&1   # затем tail -f /tmp/s.log
```

Общий движок — `engine.mjs` (используется обоими). **Группы**: `sessions/{bsl-demo,ssl,oscript}.json`.

Проверка результата: открыть стоп-кадр `output/<name>-popup.png` глазами — в нём
должен быть виден popup автодополнения с элементами от LS. В логе строка
`GIF ready: ... suggestSeen=true`.

---

## Архитектура

| Слой | Что |
|---|---|
| Браузерный VSCode | `code-server` в Docker, контейнер `bsl-codeserver`, хост-порт `127.0.0.1:8090` → контейнер `:8080`, `--auth none` |
| Расширение | `1c-syntax.language-1c-bsl@1.35.0` (ставится `setup.sh` с open-vsx в `extensions/`, монтируется как `/ext`) |
| Языковой сервер | `work/bsl-ls.jar` + **Temurin JRE 25** в `work/jre25` (Java 25 обязательна — см. раздел SSL) |
| Конфигурация SSL | сабмодуль `vendor/ssl_3_2` (запинен), монтируется в `/home/coder/project/src` |
| Драйвер | `record.mjs` — Playwright (headless Chromium, `recordVideo`) → webm → `ffmpeg` → gif |

Расширение настроено на внешний jar (см. `config/User/settings.json`):
`languageServerExternalJar=true`, `...ExternalJarPath=/work/bsl-ls.jar`,
`...ExternalJarJavaPath=/work/jre25/bin/java`, `downloadLanguageServer=false`.

**Важно для демо:** `language-1c-bsl.contextSystemEnabled=false` — выключает
«Enable Plugin internal context system» (внутренний контекст плагина). Иначе расширение
подмешивает свой контекст и в автодополнении видно не чистое поведение `bsl-language-server`.
Это обязательная часть подготовки окружения; уже прописано в `config/User/settings.json`.
После изменения настроек — `docker restart bsl-codeserver`.

**Тема:** в `extensions/` установлено расширение `zhuangtongfa.Material-theme`, в
`config/User/settings.json` задано `"workbench.colorTheme": "One Dark Pro"` — активна при
старте. Все стоп-кадры/GIF записываются в этой теме.

**Чистота кадра (обязательно для записи):**
- **Чат GitHub Copilot / «Build with Agent»** (вторичная боковая панель справа) закрывается в
  стартовой последовательности `record.mjs`: после загрузки workbench проверяется ширина
  `.part.auxiliarybar` и, если панель видна, шлётся `Ctrl+Alt+B` (toggle secondary side bar).
  Так редактор занимает всю ширину и чат не попадает в GIF.
- **Жёлтые рамки вокруг кириллицы** (Unicode highlight: неоднозначные/не-ASCII символы) выключены
  в `settings.json`: `editor.unicodeHighlight.ambiguousCharacters/nonBasicASCII/invisibleCharacters=false`.
  Без этого VS Code обводит кириллические буквы (А, Б, …) рамками — мусор на кадрах.

---

## Поднять / проверить контейнер

```bash
# проверить
docker ps --filter name=bsl-codeserver
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/    # ждём 302

# если контейнера нет — создать заново (пересоздаёт, если есть; ждёт 302):
scripts/start-codeserver.sh              # PORT=xxxx — другой хост-порт (тогда CODE_SERVER_URL для record*.mjs)

# если контейнер просто остановлен:
docker start bsl-codeserver
```

Монтирования (см. шапку `scripts/start-codeserver.sh`): `work/`→`/work` (ro), `workspace/`→
`/home/coder/project` (rw, движок пишет сюда фикстуры), `vendor/ssl_3_2/src`→`/home/coder/project/src`
(ro, вложенный mount поверх воркспейса), `v8bin/`→`/home/coder/v8bin` (ro), `config/`→
`~/.local/share/code-server`, `extensions/`→`/ext`. На хосте `workspace/src/` — пустая точка монтирования.

---

## Обновить LS до текущей версии

GIF должен показывать **актуальную** версию `bsl-language-server`. jar берём из
сборки нужной ветки (по умолчанию `develop`).

По умолчанию `setup.sh` кладёт jar последнего релиза; для develop-сборки:

```bash
cd <путь к клону>/bsl-language-server
git checkout develop && git pull            # или нужная ветка
# собрать (в worktree добавляй -Dversioning.disable=true -Pversion=0.0.0-DEV):
./gradlew bootJar
# подложить свежий exec.jar в стенд (из корня этого репо):
cp "$(ls -t <путь к клону>/bsl-language-server/build/libs/*-exec.jar | head -1)" work/bsl-ls.jar
# проверить версию под JRE контейнера (Java 25!):
work/jre25/bin/java -jar work/bsl-ls.jar --version
# применить новый jar — перезапустить контейнер (LS стартует при открытии .bsl):
docker restart bsl-codeserver
```

`work` смонтирован read-only — `cp` делаем на хосте, контейнер видит изменение.

---

## Сессия-раннер (быстрая массовая перегенерация)

`record-session.mjs sessions/<group>.json` открывает воркспейс ОДИН раз, прогревает контекст LS
ОДИН раз, затем гоняет все сценарии группы в той же тёплой сессии и режет одно видео на
пер-сценарные GIF по таймкодам шагов. Для SSL это экономит ~10 мин (1 прогрев вместо ~12).

- Группа: `{ "workspace": "...", "warmupMs": N, "scenarios": ["имя1","имя2",...] }`. Все сценарии
  группы должны делить воркспейс. Текущие группы: `bsl-demo` (19), `ssl` (12), `oscript` (6).
- Между сценариями `engine.resetEditors` сбрасывает состояние: Escape×3 → «Revert File» (сброс
  несохранённых правок) → «View: Close All Editors» → закрытие нижней панели (DOM-проверка
  `.part.panel` + `Ctrl+J`; команда «View: Close Panel» оказалась нестабильной) → «View: Show
  Explorer» (прячет докнутый view иерархии вызовов/референсов). Без этого панель Проблем и view
  call-hierarchy ПРОТЕКАЮТ в следующие сценарии.
- **Запускать с OS-таймаутом и ПРЯМЫМ логом** (`timeout 900 node … > /tmp/s.log 2>&1`), НЕ через
  `| grep` — grep блок-буферизует вывод в файл, из-за чего прогресс выглядит «зависшим», хотя
  сессия идёт. GIF пишутся только в самом конце (фаза нарезки).
- Действие `folding` сворачивает клавишей `Ctrl+Shift+[` (`Control+Shift+BracketLeft`); команда
  палитры «Fold» в этом code-server не срабатывала.

## Добавить новый сценарий (рабочий поток для 10+ кейсов)

1. Скопируй ближайший по смыслу JSON из `scenarios/` под новым именем `NN-краткое-имя.json`.
2. Задай `content` — содержимое `.bsl`-фикстуры (движок сам пишет её в `project/`).
3. Опиши `steps` (см. справочник ниже). Минимальный автодополняющий кейс:
   поставить курсор → напечатать префикс → `suggest`/`waitSuggest` → `pause` → `shot`.
4. Запусти `node record.mjs scenarios/NN-….json`, проверь `output/NN-…-popup.png`.

Имя сценария (`name`) = имя выходного GIF. Держи `name` = имени файла без `.json`.

### Справочник действий (`steps[]`)

| action | поля | что делает |
|---|---|---|
| `lineEnd` | `line` | курсор в КОНЕЦ строки N (Ctrl+G + End) — надёжно, без счёта колонок; предпочтительно |
| `goto` | `line`, `column` | курсор на точную позицию (Ctrl+G `line:col`); колонки хрупкие из-за табов |
| `cursorEnd` / `cursorTop` | — | курсор в конец / начало файла |
| `find` | `text`, `next` | Ctrl+F: ставит курсор на вхождение текста (набор уже выделяет 1-е; `next` N — перейти к N-му дальше). Чтобы курсор был ВНУТРИ идентификатора (для F12/Shift+F12), добавь следом `{"action":"key","key":"ArrowLeft"}` — выделение схлопнется к началу слова |
| `type` | `text`, `delay`(мс/символ) | печатает текст (юникод/кириллица ок) |
| `key` | `key`, `times`, `gapMs` | нажатие клавиши N раз (`"Enter"`, `"ArrowDown"`, `"Escape"`, `"Control+Space"`) |
| `suggest` | `tries`, `maxMs` | жмёт Ctrl+Space и ждёт popup, с ретраями |
| `waitSuggest` | `maxMs` | просто ждёт popup (когда триггерит сам ввод, напр. точка) |
| `peek` | — | Peek Definition: Alt+F12, с фолбэком через палитру (Alt+F12 в headless-Chromium не доставляется, поэтому фолбэк почти всегда и срабатывает) |
| `hover` | `maxMs`, `settleMs`, `ctrl`, `shot` | наводит мышь на позицию курсора и ждёт ОТОБРАЖЁННЫЙ `.monaco-hover` (ширина>0 + есть текст; isVisible ненадёжен — есть скрытые measuring-узлы). Сначала уводит мышь в сторону, потом въезжает в токен — Monaco показывает hover только на свежем mouse-enter. `ctrl:true` — держать Control (document links); `shot:"имя"` — снимок ВНУТРИ действия в момент появления hover (точнее отдельного шага `shot`) |
| `doubleClick` | `waitMs` | двойной клик по позиции курсора — выделяет слово (нужно, чтобы стала видна подсветка вхождений documentHighlight) |
| `ctrlClick` | `waitMs` | Ctrl+Click по позиции курсора |
| `colorPicker` | `index`, `pick`(+`px`,`py`), `convert`, `shot` | открывает палитру по образцу цвета №`index`. `pick:true` + `px`/`py` — клик в saturation-box (МЕНЯЕТ цвет). `convert:"подстрока"` — переключает ПРЕДСТАВЛЕНИЕ цвета кликом по `.picked-color` (web↔RGB, цвет СОХРАНЯЕТСЯ), ретраит пока подстрока (напр. `WebЦвета`) не исчезнет из кода |
| `documentLink` | `linkText`, `shot`, `maxMs` | показывает LSP-DocumentLink над диапазоном диагностики и Ctrl+наводит. Берёт МАГИЧЕСКОЕ ЧИСЛО (MagicNumber) — не идентификатор, иначе go-to-definition перебивает ссылку. Ссылки рендерятся ЛЕНИВО → действие дёргает правку-ноль (space+Backspace) + скролл, ретраит пока токен не станет `.detected-link` |
| `command` | `text`, `waitMs` | выполнить команду через палитру (Ctrl+Shift+P → текст → Enter); keybinding-независимо |
| `pause` | `ms` | пауза (чтобы зритель увидел кадр) |
| `shot` | `name` | стоп-кадр `output/<scenario>-<name>.png` для верификации |

> **Ловушки рендеринга (важно для hover/documentLink/color):**
> - **hover member-доступа/полей структуры через мышь ФЛАКИ** (Monaco требует «настоящего» движения мыши). Надёжно отображается hover ПРОСТОЙ переменной/объявления — для демо типа поля присвой его в локальную переменную (`Н = Заказ.Номер;`) и наводи на НЕЁ.
> - **LSP DocumentLink не рендерится сразу** и **перебивается go-to-definition** на идентификаторах с определением → бери MagicNumber на числовом литерале + ленивый триггер (см. action `documentLink`). Сам провайдер работает (проверено LSP-пробой), это поведение клиента code-server.
> - **Конвертация web-цвета** — это переключение color-presentation (`.picked-color`, цвет сохраняется), НЕ выбор нового цвета в палитре. Это два РАЗНЫХ демо.

> **F12 / Shift+F12 / Alt+F12 в headless-Chromium:** обычный `key F12` (Go to Definition) и
> `key Shift+F12` (Find All References — открывает peek-виджет со списком ссылок и счётчиком
> `References (N)`) доставляются и работают. `Alt+F12` (Peek Definition) — нет, поэтому для него
> используется действие `peek` с фолбэком на палитру.

### Поля сценария (верхний уровень)

| поле | по умолч. | смысл |
|---|---|---|
| `name` | — | имя GIF/скриншотов (обязательно) |
| `title` | — | человекочитаемое описание (для документации) |
| `fixture` | `demo.bsl` | имя файла в `project/` |
| `content` | — | содержимое фикстуры (перезаписывается каждый прогон). Если НЕ задан — файл не трогаем, открываем существующий (для реальных конфигураций) |
| `workspace` | `/home/coder/project` | какую папку открыть в code-server. Обычно НЕ задаётся — единый воркспейс уже содержит и demo-файлы, и `src/cf` |
| `openQuery` | = `fixture` | что набрать в Quick Open. Для файла конфигурации — путь от корня воркспейса, напр. `src/cf/CommonModules/.../Ext/Module.bsl` |
| `warmupMs` | 25000 | **макс. ожидание** готовности контекста LS (не фиксированный sleep). Для SSL ставь крупнее (напр. 180000) |
| `expectSuggest` | false | если true — ненулевой код выхода, когда popup так и не появился |
| `leadSec` | 1.0 | сколько секунд контекста показать до первого действия |
| `fps` / `width` | 12 / 960 | параметры GIF |

---

## Документ-каталог фич (по файлу на провайдера)

Итоговый артефакт — каталог возможностей: **один markdown-файл на провайдера**, перед
каждой GIF — описание на пару предложений (что конкретно происходит). Собирается:

```bash
node build-doc.mjs
#  RU: capabilities/<feature>.md          + capabilities/index.md      (индекс)
#  EN: en/capabilities/<feature>.md       + en/capabilities/index.md   (корень EN-сайта mkdocs)
```

Раскладка под mkdocs-i18n: RU-файлы в `capabilities/`, EN — в `en/capabilities/` (`en/` —
корень EN-версии сайта). GIF-ссылки — публичные CDN-URL из `gif-urls.json` (см. ниже); без
них фолбэк на относительные `../output/<name>.gif` (RU) / `../../output/<name>.gif` (EN).
На сайт BSL LS копируется: `capabilities/` → `docs/capabilities/`, `en/capabilities/` →
`docs/en/capabilities/`; блок-индекс из `capabilities/index.md` вставлен в раздел
«Возможности»/«Features» в `docs/index.md` и `docs/en/index.md` (ссылки `capabilities/<feature>.md`).

- **`features.json`** — канонический список всех LSP-провайдеров: `order`, `shortcut`,
  `ru/en` (title + desc). Источник правды для заголовка файла фичи и индекса. Русские
  «описательные» shortcut'ы переводятся на EN картой `SHORTCUT_EN` в `build-doc.mjs`.
- **`descriptions.json`** — `{ "<имя-сценария>": {"ru": "...", "en": "..."} }`, 2 фразы на
  сценарий: что за действие и что показывает LS. Рендерится ПЕРЕД каждой GIF. `build-doc.mjs`
  логирует `MISSING descriptions`, если у сценария с GIF нет описания.
- **`gif-urls.json`** — `{ "<имя>": "https://github.com/user-attachments/assets/<uuid>" }`.
  Если есть — `build-doc.mjs` подставляет в `![]()` **публичный CDN-URL** (а не относительный
  `../output/...`), чтобы доки рендерили GIF на сайте/в GitHub **без ~190 МБ бинарей в git**.
  Хостинг: гифки залиты в GitHub `user-attachments` (drag-drop в поле комментария через
  Playwright, см. ниже) и сделаны публичными ссылкой на них из **залоченного ишуза-якоря
  [#4146](https://github.com/1c-syntax/bsl-language-server/issues/4146)** (ассет публичен
  только пока на него ссылается опубликованный комментарий — якорь НЕ удалять).
- Сценарии группируются по полю **`feature`**; в файл фичи попадают все её сценарии с
  готовым `output/<name>.gif`. Один сценарий → описание+GIF под H1; несколько → каждый под
  своим `##` (`title`/`titleEn`).

**Залить/обновить GIF в CDN (Playwright + GitHub user-attachments):** открыть поле комментария
(классический редактор, напр. на странице PR) → клик «Add files» → `browser_file_upload`
(можно пачкой, выставив `input.multiple=true`) → из textarea вынуть `<img alt=имя src=URL>` →
сослаться на все URL в комментарии **залоченного ишуза-якоря** (`gh issue comment`) и проверить
`curl` (200/image/gif) → сложить карту в `gif-urls.json`. Заметки: ассет 404 публично, пока
комментарий-якорь не опубликован; новый React-редактор ишузов флакает на bulk-загрузке —
надёжнее классический редактор (страница PR).

**Чтобы добавить фичу/сценарий в каталог:** заведи сценарий с `"feature": "<ключ>"`, добавь
запись в `descriptions.json` (ru+en), при необходимости фичу в `features.json`, прогони
`build-doc.mjs` (проверь, что нет `MISSING descriptions`).

**Другие форматы каталога (тот же источник — features.json + scenarios):**
- `node build-html.mjs` → `dist/index.html` + `dist/gifs/` и архив `FEATURES-html.zip` —
  самодостаточный HTML с **анимированными GIF** (открыть index.html в браузере). ~82 МБ.
- `node build-pdf.mjs` → `FEATURES.ru.pdf` через headless Chromium. PDF НЕ анимирует GIF, поэтому
  берётся ключевой кадр каждого сценария (новейший `output/<name>-*.png`, кроме `-error.png`;
  фолбэк — последний кадр GIF через `ffmpeg -vf reverse`).

> GIF (~200 МБ) в git НЕ коммитятся (`.gitignore`): доки ссылаются на CDN-URL из `gif-urls.json`.
> `build-doc.mjs` включает сценарий в каталог, если у него есть URL в `gif-urls.json` ИЛИ локальный
> `output/<name>.gif`, поэтому каталог собирается и на свежем клоне без записанных GIF.

## Готовность контекста LS (gate, а не таймер)

Движок НЕ ждёт фиксированное время — он ждёт **реальной готовности** контекста по статусбару
bsl-language-server. LS показывает фазы прогресса (из его i18n):
1. `Ищем файлы…` → `Наполняем контекст…: N/M файлов` → `Наполнение контекста завершено.`
2. `Рассчитываем данные конфигурации…` → `Расчет метаданных конфигурации завершен.`

`waitForReady(warmupMs)` ждёт, пока НИ одной из этих фраз нет (с двойной проверкой простоя,
чтобы не проскочить зазор между фазами), и только потом начинает запись. `warmupMs` — это
**потолок** ожидания. GIF авто-обрезается до момента первого действия (см. `trimFrom` в логе),
так что длительная индексация в кадр не попадает.

## Платформенный контекст (HBK синтакс-помощника)

Чтобы completion/hover/signatureHelp платформенных методов опирались на реальный
синтакс-помощник (а не на ограниченный builtin-JSON), LS грузит HBK локальной 1С.

- Локальная платформа на хосте: `/opt/1cv8/x86_64/<версия>/` (там `shcntx_*.hbk`, `shlang_*.hbk` и т.д.).
- **snap-docker НЕ монтирует `/opt`** (confinement: только из `$HOME`). Поэтому `sh*.hbk`
  копируются в `v8bin/` (`setup.sh`, переменная `V8_BIN`) и монтируются как `/home/coder/v8bin:ro`.
  HBK — проприетарные файлы 1С, в репозиторий НЕ коммитятся. Без них LS работает на builtin-контексте.
- В `.bsl-language-server.json` воркспейса задан путь:
  ```json
  { "v8platform": { "binPath": "/home/coder/v8bin" } }
  ```
- Признак успеха в LS-логе: `Loaded NNNN platform contexts from 1C syntax helper`
  (без него — `No 1C platform installations found…`).

Обновить HBK при смене платформы: `cp /opt/1cv8/x86_64/<вер>/sh*.hbk v8bin/` + `docker restart`.

## Единый воркспейс + конфигурация SSL (межмодульные сценарии)

Воркспейс **один** — `workspace/` (монтируется как `/home/coder/project`, rw). В контейнере в нём лежат:
- demo-файлы (`demo.bsl` и т.п. — движок пишет фикстуры сюда);
- реальная конфигурация **`1c-syntax/ssl_3_2`** (designer-формат) в подкаталоге `src/cf`
  (там `Configuration.xml`) — это сабмодуль `vendor/ssl_3_2`, чей `src/` смонтирован ro в
  `/home/coder/project/src`;
- `.bsl-language-server.json` в корне с `"configurationRoot": "./src/cf"` и `v8platform.binPath`.

Поэтому сценарии межмодульной навигации НЕ задают `workspace` (берётся дефолт
`/home/coder/project`), а в `openQuery` дают путь относительно корня, напр.
`src/cf/CommonModules/.../Ext/Module.bsl`.

### ⚠️ SSL запинен на коммит `4a4513f8` — НЕ обновлять сабмодуль!
`vendor/ssl_3_2` — сабмодуль ssl_3_2 на `4a4513f8` (никаких `git submodule update --remote`)
(«Обновление версии конфигурации поставщика на 3.2.1.319»). Сценарии перехода используют
**жёстко прописанные `line:column`** (напр. def-08 → `803:30`, def-09 → `46:48`). Любой
`git pull`/обновление SSL сдвинет номера строк и колонок → все `goto` промахнутся.
**Никогда не обновляй конфигурацию без явной переинвентаризации позиций во всех сценариях.**

## Синтетический BSL-воркспейс `bsl-demo` (большинство провайдеров)

Чтобы не ждать прогрев SSL (180с) для провайдеров, работающих на одном модуле, заведён быстрый
под-воркспейс `workspace/bsl-demo` (`"workspace": "/home/coder/project/bsl-demo"`):
- `.bsl-language-server.json` — `language ru` + `v8platform.binPath=/home/coder/v8bin` (для богатого
  hover/signatureHelp платформенных типов);
- `demo.bsl` — насыщенный модуль: документированная `Функция Сложить` (hover/signature/callHierarchy),
  вызовы с inlay-подсказками, `#Область`-регионы (folding), `Новый Цвет(255,128,0)` (color +
  диагностика StyleElementConstructors → codeAction), URL в комментарии (documentLink), `Сообщить`
  (диагностика DeprecatedMessages), magic numbers;
- `messy.bsl` — намеренно кривой код для `formatting`.

На нём записаны сценарии: hover-01, signatureHelp-01, diagnostics-01, codeAction-01, formatting-01,
rename-01, documentSymbol-01, documentHighlight-01, callHierarchy-01, folding-01, selectionRange-01,
semanticTokens-01, inlayHint-01, codeLens-01, color-01, documentLink-01. workspaceSymbol-01 — на SSL
(нужна ширина проекта). Все 20 LSP-провайдеров покрыты (см. FEATURES.*.md, 0 заглушек).

> **Позиции `goto` в `demo.bsl` жёстко привязаны.** `files.autoSave=off` в настройках — но сценарии,
> которые ПЕЧАТАЮТ (signatureHelp набирает `Сложить(`), всё равно меняют буфер; не сохраняй и не
> запускай их с autosave. Если печатавший сценарий случайно сохранил файл — верни `demo.bsl` в исходный вид.

## Демо OneScript (.os) — отдельный под-воркспейс

Навигация по OneScript НЕ зависит от 1С-конфигурации SSL, поэтому OScript-сценарии открывают
**отдельную папку** `workspace/oscript-demo` (в сценарии `"workspace": "/home/coder/project/oscript-demo"`).
Так LS индексирует только её (быстрый прогрев, без парсинга SSL). Раскладка — канонический
opm-проект:
```
oscript-demo/
├── .bsl-language-server.json        # минимальный (language ru)
├── src/demo.os                      # потребитель: #Использовать demolib + ссылки
└── oscript_modules/demolib/         # библиотека (имя = имя каталога → #Использовать demolib)
    ├── lib.config                   # <package-def> с <module>/<class>
    └── src/
        ├── СтроковыеУтилиты.os       # МОДУЛЬ (без конструктора)
        ├── ФорматировщикОтчета.os    # КЛАСС с явным Процедура ПриСозданииОбъекта(...)
        ├── ПростойКонтейнер.os       # КЛАСС без конструктора
        └── АннотацияКэшировать.os    # &Аннотация("Кэшировать") — зарегистрированная аннотация
```
Аннотация регистрируется методом, помеченным `&Аннотация("Имя")` (см. `АннотацияКэшировать.os`);
использование `&Имя(...)` (см. потребитель `src/demo-annotation.os`) резолвится в этот метод
через `AnnotationReferenceFinder`/`AnnotationRepository` (реестр воркспейс-скоупа, имя
регистронезависимо). Потребитель аннотации — ОТДЕЛЬНЫЙ файл `src/demo-annotation.os` (чтобы не
сдвигать позиции def-10..14 в `src/demo.os`).
Как резолвится переход (механизм LS): F12 на `Модуль.Метод()`/имени модуля → файл модуля;
`Новый Класс(...)` → `NewExpressionReferenceFinder` → если в классе есть `ПриСозданииОбъекта`
(или `OnObjectCreate`) — курсор встаёт на эту процедуру (`ConstructorSymbol`), иначе fallback
в начало файла-модуля. Сценарии: `def-10-oscript-module` (имя модуля), `def-11-oscript-class-no-constructor`,
`def-12-oscript-class-with-constructor`, `def-13-oscript-module-method` (метод модуля
`ВыполнитьФорматирование`→`СтроковыеУтилиты.os`), `def-14-oscript-instance-method` (метод
экземпляра `Отчет.Сформировать()`→`ФорматировщикОтчета.os`), `def-15-oscript-annotation`
(использование `&Кэшировать`→метод с `&Аннотация("Кэшировать")`). Позиции `goto` жёстко привязаны
к `src/demo.os` — при правке файла пересчитать line:col (новые строки добавлять ПОСЛЕ строки 12,
чтобы не сдвинуть def-10/11/12).

#### Зоо-библиотека `oscript_modules/zoolib` — демо `implementation` и `typeHierarchy`
`ImplementationProvider` и `TypeHierarchyProvider` работают ТОЛЬКО для `.os`-классов
библиотеки наследования `extends` (`&Интерфейс`/`&Реализует`/`&Расширяет`) и только для
**зарегистрированных** library-классов (через `lib.config` пакета). Аннотации распознаются
LS по имени — сама библиотека `extends` в воркспейсе НЕ нужна.
Раскладка (фикстуры — копия known-good тестовых `src/test/resources/type-hierarchy` + `interface-lib`):
```
oscript_modules/zoolib/
├── lib.config                  # <package-def> со всеми 7 классами (file="src/X.os")
└── src/
    ├── Животное.os             # корень иерархии (без аннотации)
    ├── Млекопитающее.os        # &Расширяет("Животное")
    ├── Кошка.os / Собака.os    # &Расширяет("Млекопитающее"); Собака ещё &Реализует("Плавающее")
    ├── Утка.os                 # &Расширяет("Животное") + &Реализует("Плавающее"/"Летающее")
    └── Плавающее.os / Летающее.os  # &Интерфейс + экспортный метод
```
- `implementation-01`: курсор на экспортном методе интерфейса `Плавающее.Плавать()` (стр.7) →
  «Go to Implementations» → реализаторы Собака + Утка. Реализатор ДОЛЖЕН иметь одноимённый
  экспортный метод, иначе список пуст.
- `typeHierarchy-01`: открыт `Млекопитающее.os`, «Show Type Hierarchy» → панель SUBTYPES OF
  (Кошка, Собака; деталь `: Родитель` из `supertypeName`). Позиция курсора не важна (класс = файл целиком).
Проверка БЕЗ браузера — `tools/probes/lsp_zoo.py` (real-LSP probe): шлёт prepareTypeHierarchy/supertypes/subtypes
и implementation, rootUri = oscript-demo (иначе zoolib не проиндексируется как library-классы).

### ⚠️ Требуется Java 25 (НЕ 21!)
Это оказалось критично. На **Java 21** XStream внутри mdclasses 0.18.0 не может
инстанцировать модельные классы (`DesignerRootWrapper` без no-arg конструктора) → в логе
`ExtendXStream: Can't read file '.../Configuration.xml' - it's broken (skipped)` → конфигурация
НЕ грузится → межмодульный переход не работает. На **Java 25** тот же jar парсит конфиг
нормально. Релизный LS работает именно потому, что несёт bundled Java 25.

Поэтому стенд использует `work/jre25` (Temurin 25.0.3), а `languageServerExternalJarJavaPath`
указывает на `/work/jre25/bin/java`. `--add-opens` НЕ нужны (проверено).
Признак успеха: в LS-логе НЕТ строки `broken`, есть фаза «Расчет метаданных конфигурации завершен».

---

## Troubleshooting

- **`npx`/`npm` падает с `ENOTFOUND`** — npm registry указывает на недоступное зеркало.
  Ставить с `--registry https://registry.npmjs.org/` (`npm install --registry …`).
- **`suggestSeen=false` / popup не появился** — (1) LS не прогрелся → увеличь `warmupMs`;
  (2) курсор не там, где есть автодополнение → проверь `goto`/`content`; (3) посмотри
  `output/<name>-error.png`.
- **Контейнер не отвечает (не 302)** — см. раздел про контейнер; `docker logs bsl-codeserver`.
- **Файл не открывается из Quick Open (редактор пуст, палитра висит, `page.click(.monaco-editor)` таймаутит)** —
  на некоторых сборках `codercom/code-server:latest` Enter в палитре НЕ открывает файл из
  fuzzy-списка с многими совпадениями (часто для SSL: десятки `Module.bsl`). `record.mjs` это
  обходит: после Enter проверяет видимость `.quick-input-widget` и кликает верхний результат
  `.quick-input-list .monaco-list-row`. Если снова сломается — проверь этот блок в `record.mjs`.
- **GIF слишком большой** — уменьшай `width` (напр. 800) или `fps` (напр. 10), либо
  короче сценарий / меньше `pause`.
- **Chromium не стартует** — `npx --registry https://registry.npmjs.org/ playwright install chromium`.
- **«Фича не работает» — сперва проверь РЕАЛЬНЫМ LSP, не глазами в code-server.** Юнит-тесты
  и беглый просмотр обманывают (см. #3988, значения перечислений). Минимальные stdio-клиенты —
  `tools/probes/` (initialize → didOpen → completion/hover/codeLens/…; jar и java берутся из
  `work/`, переопределяются `BSL_LS_JAR`/`BSL_LS_JAVA`; см. `tools/probes/README.md`). Так разведён вопрос «баг в LS» vs «особенность рендера клиента code-server»
  (напр. documentLink провайдер РАБОТАЕТ, но code-server рендерит ссылки лениво).
- **«Баг» воспроизводится только в code-server** — сначала `work/jre25/bin/java -jar work/bsl-ls.jar --version`:
  jar в стенде мог устареть относительно develop. Ложная тревога `docs/notes/DISPATCH-*` случилась
  именно так (фиксы уже были в develop, стенд крутил старый jar). Пересобрать и переложить jar — первый шаг.
- **SSL-сценарий показывает пустой список / не переходит, хотя «context ready»** — недоиндексация:
  SSL — 2175 файлов, а LS в контейнере голодает по CPU, если параллельно идёт сборка (gradle и т.п.).
  Записывать SSL только на простаивающей машине. Члены общего модуля материализуются из AST модуля,
  поэтому `comp-07` (идёт первым в группе) особенно чувствителен — для него `sessions/_comp07only.json`
  с `warmupMs: 480000`. Пустой результат в такой ситуации — НЕ регрессия LS.
- **Платформенное поведение (HBK) проверяется только в контейнере.** LS на хосте не подхватывает
  платформенный контекст из `v8bin/` (грузится 0 контекстов), поэтому пробы из `tools/probes/` видят
  только builtin-контекст. `docker exec -i … java -jar … --lsp` как stdio-канал умирает через ~60 с —
  для проверки в контейнере пиши сценарий/GIF или смотри лог LS в Output code-server.
- **CodeLens-навигация падает по клику** (тост `argument does not match one of these constraints`):
  линза, чья команда — встроенная `editor.action.goToLocations`/`peekLocations`/`showReferences`,
  получает аргументы сырым JSON, а VS Code ждёт `vscode.Uri`/`Location`. Это ограничение клиента:
  нужна bridge-команда в расширении (как `language-1c-bsl.languageServer.runTest`). Для демо
  кликабельны только линзы клиентских команд (run test) и серверных (toggle complexity).
- **Призрачные вкладки/грязные буферы из прошлой сессии** в первом сценарии — `record-session.mjs`
  теперь делает `resetEditors` ПЕРЕД каждым сценарием (включая первый). Удалённый с диска файл
  может остаться как ghost-вкладка, пока буфер открыт server-side.

---

## Карта файлов

```
./
├── README.md / AGENTS.md ← обзор для людей / выжимка для агентов
├── RUNBOOK.md            ← этот файл
├── scripts/setup.sh      ← первичная установка (сабмодуль, JRE 25, jar, HBK, расширения, Playwright)
├── scripts/start-codeserver.sh ← (пере)создать контейнер bsl-codeserver
├── engine.mjs            ← общий движок шагов (+ ROOT, CODE_SERVER_URL)
├── record.mjs            ← запись одного сценария
├── record-session.mjs    ← запись группы в тёплой сессии (sessions/*.json)
├── build-doc.mjs         ← генератор каталога: capabilities/<feature>.md (RU) + en/capabilities/ (EN)
├── build-html.mjs / build-pdf.mjs ← HTML-архив с анимированными GIF / PDF с ключевыми кадрами
├── features.json         ← каталог ~20 провайдеров (order/shortcut/ru/en)
├── descriptions.json     ← {name:{ru,en}} — описание перед каждой GIF
├── gif-urls.json         ← {name:CDN-URL} — публичные user-attachments ссылки (хост — ишуз #4146)
├── capabilities/         ← по файлу на провайдера (RU) + index.md (индекс)
├── en/capabilities/      ← то же на EN (корень EN-сайта mkdocs)
├── scenarios/            ← по JSON на сценарий (feature/title/titleEn/openQuery/steps)
├── sessions/             ← группы сценариев для record-session.mjs (bsl-demo / ssl / oscript)
├── workspace/            ← ЕДИНЫЙ воркспейс (монтируется rw как /home/coder/project):
│                            demo.bsl + .bsl-language-server.json (configurationRoot=./src/cf, v8platform)
│   ├── src/              ← (git-ignored) точка монтирования vendor/ssl_3_2/src
│   ├── bsl-demo/         ← быстрый синтетический BSL-воркспейс
│   ├── rename-demo/      ← воркспейс для rename
│   └── oscript-demo/     ← под-воркспейс OneScript (opm-проект: src/demo.os + oscript_modules/demolib, zoolib)
├── vendor/ssl_3_2/       ← сабмодуль 1c-syntax/ssl_3_2 @ 4a4513f8 (НЕ обновлять!)
├── tools/probes/         ← real-LSP stdio-пробы и probe-ready (см. tools/probes/README.md)
├── docs/notes/           ← заметки исследований (go-to-def в редакторе, недостающие фичи)
├── .claude/skills/       ← скилл record-lsp-gif для Claude Code
├── config/User/settings.json  ← настройки code-server (внешний jar→jre25, Xmx3g, contextSystemEnabled=false, тема One Dark Pro)
│  (git-ignored, ставит setup.sh:)
├── v8bin/                ← sh*.hbk локальной платформы (монтируется как /home/coder/v8bin); см. раздел HBK
├── work/  bsl-ls.jar + jre25/  ← LS + JRE 25 (монтируется ro как /work)
├── extensions/           ← language-1c-bsl + One Dark Pro (монтируется как /ext)
├── output/               ← ГОТОВЫЕ GIF и стоп-кадры
└── videos/               ← сырые webm от Playwright (можно чистить)
```

## (Опционально) интерактивное вождение через Playwright MCP

Для разовых ручных проверок можно подключить Playwright MCP с конфигом `pw-mcp-config.json`
(запускать из корня репо: `npx @playwright/mcp --config pw-mcp-config.json`). Его инструменты `mcp__playwright__*` появляются у агента только после
**reconnect/перезапуска сессии**. Для пакетной записи он НЕ нужен — `record.mjs`
самодостаточен.
