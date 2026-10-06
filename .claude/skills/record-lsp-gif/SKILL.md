---
name: record-lsp-gif
description: Record demo GIFs of BSL Language Server features in code-server. Use when recording or re-recording a scenario or a session group, adding a new scenario for an LSP provider, or regenerating the capabilities catalog (build-doc / build-html / build-pdf).
---

# Record an LSP demo GIF

`RUNBOOK.md` is the source of truth; this skill is the order of operations. Read the RUNBOOK
sections named in each step before acting on it.

## 1. Stand is up

```bash
docker ps --filter name=bsl-codeserver          # or: scripts/start-codeserver.sh
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/
```

Done when the answer is `302`. Missing `work/`, `extensions/` or `vendor/ssl_3_2/src` → run
`scripts/setup.sh` first. A new jar needs `docker restart bsl-codeserver` (RUNBOOK «Обновить LS»).

## 2. The LS really does it

When the feature is new or "doesn't show" in code-server, first confirm `work/bsl-ls.jar` is a
build of the branch you mean to demo (`--version`; RUNBOOK «Обновить LS»). Then run the matching probe from
`tools/probes/` (see its README) against `work/bsl-ls.jar`. Done when the probe prints the
expected items. An empty probe result is an LS issue: write it up in `docs/notes/` and stop —
no recorder change will fix it.

## 3. Scenario

Pick the workspace (RUNBOOK «Синтетический BSL-воркспейс», «Единый воркспейс + SSL», «Демо
OneScript»): `bsl-demo` for single-module providers, the root workspace for cross-module SSL
navigation, `oscript-demo` for `.os`. Copy the closest `scenarios/*.json`, keep `name` equal to
the file name, set `feature` (a key of `features.json`), `title`, `titleEn`, then `steps` from the
RUNBOOK action table. Add the scenario's `ru`/`en` text to `descriptions.json`.

Done when every `goto` targets a position you verified in the fixture or the pinned SSL file.

## 4. Record

```bash
node record.mjs scenarios/<name>.json > /tmp/<name>.log 2>&1
# a whole group, one LS warm-up:
timeout 900 node record-session.mjs sessions/<group>.json > /tmp/session.log 2>&1
```

Add the scenario to the matching `sessions/*.json` so the next bulk re-record includes it.

Done when the log has `GIF ready` (or `GIF <name>.gif` for a session) **and** you have looked
at `output/<name>-*.png` and `output/<name>.gif` and seen the LS result on screen — popup,
hover, peek, panel. `suggestSeen=true` alone is not proof for non-completion features. Failure
→ `output/<name>-error.png` and RUNBOOK «Troubleshooting».

## 5. Catalog

```bash
node build-doc.mjs        # capabilities/*.md + en/capabilities/*.md
```

Done when the run prints no `MISSING descriptions` and the feature page lists the new GIF. Until
the GIF is uploaded and its URL added to `gif-urls.json` (RUNBOOK «Залить/обновить GIF в CDN»),
the page points at the local `output/` file. Ask the user before uploading — it publishes the GIF.
