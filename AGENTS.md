# Agent guide

Scenario-driven GIF recorder for BSL Language Server features: code-server in Docker, driven by
Playwright, one JSON per scenario. Docs are in Russian; code comments in English.

- **Recording, re-recording or adding a scenario, rebuilding the capabilities catalog** — read
  `RUNBOOK.md` in full first; it is the source of truth (step actions, scenario fields, gotchas).
  The `record-lsp-gif` skill walks the flow.
- **A feature looks broken in code-server** — first check `work/bsl-ls.jar` is a fresh build
  (a stale jar already produced one false bug report), then confirm with a real-LSP probe before
  touching the recorder: `tools/probes/README.md`. Write confirmed LS gaps up in `docs/notes/`.
- **First-time setup / fresh clone** — `scripts/setup.sh`, then `scripts/start-codeserver.sh`.

## Guardrails

- `vendor/ssl_3_2` stays pinned at `4a4513f8`. Scenarios navigate by hard-coded `line:col`, so any
  submodule bump silently breaks every SSL `goto`.
- Fixture positions are hard-coded too (`workspace/bsl-demo/demo.bsl`, `workspace/oscript-demo/src/demo.os`):
  append new lines at the end of a fixture, or re-inventory every `goto` that points into it.
- Keep binaries out of git: `work/` (jar, JRE), `v8bin/` (1C `*.hbk`, proprietary), `extensions/`,
  and all GIF/video output. Published GIFs are referenced by URL from `gif-urls.json`.
- Edits to `capabilities/` and `en/capabilities/` go through `features.json`, `descriptions.json`
  and `scenarios/*.json` followed by `node build-doc.mjs` — those `.md` files are generated.
- Record SSL scenarios on an idle machine (no parallel gradle/builds): a CPU-starved LS
  under-indexes the 2175 SSL files and the GIF shows empty results that look like regressions.
- Long recorder runs: OS `timeout` plus a direct log redirect (`> log 2>&1`); a pipe through `grep`
  block-buffers and looks hung.
