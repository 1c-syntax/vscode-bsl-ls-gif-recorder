# LSP probes

Small stdio clients that talk to `work/bsl-ls.jar` directly — no code-server, no browser.
They answer one question: **does the language server itself return the right thing?**

Use a probe before recording (or re-recording) a GIF for a feature that "doesn't work" in
code-server. A GIF shows the LS *through* an editor client, and code-server has its own quirks
(lazy document links, hover needing a fresh mouse-enter, Alt+F12 not delivered in headless
Chromium). A probe separates "bug in the LS" from "the client renders it differently": if the
probe returns the expected items, fix the scenario; if it does not, it is an LS issue — record
it in `docs/notes/` instead of fighting the recorder.

All probes resolve paths from the repo root and accept overrides:

| Variable | Default | Meaning |
|---|---|---|
| `BSL_LS_JAR` | `work/bsl-ls.jar` | jar under test (e.g. a fresh `build/libs/*-exec.jar` from a feature branch) |
| `BSL_LS_JAVA` | `work/jre25/bin/java` | Java 25 — needed to read the SSL configuration |
| `BSL_PROBE_WS` | `workspace` | `lsp_enum.py` only: workspace root that has `src/cf` (use `vendor/ssl_3_2`) |

| Probe | Checks | Workspace |
|---|---|---|
| `lsp-smoke.mjs` | completion after `Сообщ` returns global methods (fastest "is the jar alive" check) | in-memory |
| `lsp_folding.py` | `foldingRange` for regions and methods | temp dir |
| `os_probe.py` | OneScript global completion (`Сцена…` → `ТекущийСценарий`/`СтартовыйСценарий`) | temp dir |
| `lsp_codelens.py` | run-test code lenses for `tests/ПримерТестов.os` | `workspace/oscript-demo` |
| `lsp_zoo.py` | `typeHierarchy` (super/subtypes) and `implementation` on the `zoolib` classes | `workspace/oscript-demo` |
| `lsp_enum.py` | completion after `Перечисления.<Имя>.` offers enum **values** | SSL (`BSL_PROBE_WS=vendor/ssl_3_2`) |
| `probe-ready.mjs` | how long code-server + LS take to index SSL; when cross-module F12 starts resolving | running code-server |

```bash
node tools/probes/lsp-smoke.mjs
python3 tools/probes/lsp_zoo.py
BSL_LS_JAR=../bsl-language-server/build/libs/bsl-language-server-0.0.0-DEV-exec.jar python3 tools/probes/lsp_codelens.py
BSL_PROBE_WS=vendor/ssl_3_2 python3 tools/probes/lsp_enum.py
```

Probes run the LS on the host, where it does not pick up the 1C platform help from `v8bin/`:
they see only the builtin platform context. Behaviour that depends on the real platform
(platform types, global-context collections) is checked in the container — record a scenario.

To probe a new feature, copy the closest script: they share the same
`initialize → didOpen → request → print` skeleton.
