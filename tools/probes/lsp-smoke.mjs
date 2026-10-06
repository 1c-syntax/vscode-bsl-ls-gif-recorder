// Deterministic LSP completion smoke test against the develop bsl-language-server jar.
// Spawns the LS in stdio mode, opens a tiny module, asks for completion after "Сообщ".
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../engine.mjs";

const JAVA = process.env.BSL_LS_JAVA || `${ROOT}/work/jre25/bin/java`;
const JAR = process.env.BSL_LS_JAR || `${ROOT}/work/bsl-ls.jar`;

// Empty temp root: pointing the LS at /tmp itself makes it index everything there.
const root = pathToFileURL(mkdtempSync(join(tmpdir(), "lsp-smoke-"))).href;
const uri = `${root}/demo.bsl`;
const text = ["Процедура Тест()", "\tСообщ", "КонецПроцедуры", ""].join("\n");
// line 1 (0-based), char after "\tСообщ" = 1 tab + 5 chars = 6
const position = { line: 1, character: 6 };

const proc = spawn(JAVA, ["-jar", JAR, "--lsp"], { stdio: ["pipe", "pipe", "inherit"] });

let buf = Buffer.alloc(0);
const pending = new Map();
let nextId = 1;

function send(method, params, isNotification = false) {
  const id = isNotification ? undefined : nextId++;
  const msg = { jsonrpc: "2.0", method, params, ...(id !== undefined ? { id } : {}) };
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  proc.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  proc.stdin.write(body);
  if (id !== undefined) return new Promise((res) => pending.set(id, res));
}

proc.stdout.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const sep = buf.indexOf("\r\n\r\n");
    if (sep === -1) return;
    const header = buf.slice(0, sep).toString("utf8");
    const m = header.match(/Content-Length:\s*(\d+)/i);
    if (!m) { buf = buf.slice(sep + 4); continue; }
    const len = parseInt(m[1], 10);
    const start = sep + 4;
    if (buf.length < start + len) return;
    const body = buf.slice(start, start + len).toString("utf8");
    buf = buf.slice(start + len);
    let msg; try { msg = JSON.parse(body); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await send("initialize", {
    processId: process.pid,
    rootUri: root,
    capabilities: { textDocument: { completion: { completionItem: { snippetSupport: true } } } },
  });
  send("initialized", {}, true);
  send("textDocument/didOpen", {
    textDocument: { uri, languageId: "bsl", version: 1, text },
  }, true);

  // poll completion until the LS finishes indexing (first request can be slow)
  let labels = [];
  let hasSoobshit = false;
  for (let attempt = 1; attempt <= 20 && !hasSoobshit; attempt++) {
    await sleep(3000);
    const resp = await send("textDocument/completion", {
      textDocument: { uri },
      position,
      context: { triggerKind: 1 },
    });
    const items = Array.isArray(resp.result) ? resp.result : (resp.result?.items ?? []);
    labels = items.map((i) => (typeof i.label === "string" ? i.label : i.label?.label)).filter(Boolean);
    hasSoobshit = labels.some((l) => l.startsWith("Сообщ"));
    console.log(`[attempt ${attempt}] items=${labels.length} hasMatch=${hasSoobshit}`);
  }
  console.log(`COMPLETION ITEMS: ${labels.length}`);
  console.log(`SAMPLE: ${labels.slice(0, 15).join(", ")}`);
  console.log(`HAS "Сообщить"-prefix item: ${hasSoobshit}`);
  console.log(hasSoobshit ? "RESULT: OK ✅" : "RESULT: NO MATCH ❌");

  send("shutdown", {});
  send("exit", {}, true);
  await sleep(300);
  proc.kill("SIGTERM");
  process.exit(hasSoobshit ? 0 : 1);
})();
