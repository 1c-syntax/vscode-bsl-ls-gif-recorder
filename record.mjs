// Single-scenario recorder for BSL LSP demo GIFs.
// Usage: node record.mjs scenarios/<name>.json
//
// Drives code-server (must already be running on $CODE_SERVER_URL, default
// http://127.0.0.1:8090) in headless
// Chromium, executes the scenario's steps, records video, and produces
// output/<name>.gif via ffmpeg. Shared logic lives in engine.mjs. See RUNBOOK.md.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { ROOT, CODE_SERVER_URL, sleep, log, waitForReady, closeChat, openFile, runStep } from "./engine.mjs";

const PROJECT = `${ROOT}/workspace`;        // mounted as /home/coder/project
const SHOT_DIR = `${ROOT}/output`;
const VIDEO_DIR = `${ROOT}/videos`;

const scenarioPath = process.argv[2];
if (!scenarioPath) { console.error("usage: node record.mjs scenarios/<name>.json"); process.exit(2); }
const S = JSON.parse(readFileSync(scenarioPath, "utf8"));
const NAME = S.name;
const WARMUP = S.warmupMs ?? 180000;
const FPS = S.fps ?? 12;
const WIDTH = S.width ?? 960;
const LEAD = S.leadSec ?? 1.0;
const WORKSPACE = S.workspace ?? "/home/coder/project";
const URL = `${CODE_SERVER_URL}/?folder=${encodeURIComponent(WORKSPACE)}`;

for (const d of [PROJECT, SHOT_DIR, VIDEO_DIR]) mkdirSync(d, { recursive: true });

// Map the container workspace back to its host path so inline `content` lands in the
// right folder (e.g. /home/coder/project/bsl-demo -> workspace/bsl-demo).
const hostWorkspace = WORKSPACE.replace("/home/coder/project", PROJECT);
const fixture = S.fixture || "demo.bsl";
if (typeof S.content === "string") writeFileSync(`${hostWorkspace}/${fixture}`, S.content);
const openQuery = S.openQuery || fixture;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const t0 = Date.now();
let trimFrom = 0;
const ctx = { shotDir: SHOT_DIR, name: NAME, state: { suggestSeen: false } };

try {
  log(`scenario "${NAME}" -> goto code-server`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".monaco-workbench", { timeout: 60000 });
  await sleep(4000);
  await closeChat(page);
  await openFile(page, openQuery);

  log(`waiting for LS context to fill (max ${WARMUP}ms)…`);
  const ready = await waitForReady(page, WARMUP);
  log(ready ? "context ready" : "context wait TIMED OUT — recording anyway");

  trimFrom = Math.max(0, (Date.now() - t0) / 1000 - LEAD);
  log(`running ${S.steps.length} steps (trimFrom=${trimFrom.toFixed(1)}s)`);
  for (const st of S.steps) { log(`  step: ${JSON.stringify(st)}`); await runStep(page, st, ctx); }
  log(`steps done. suggestSeen=${ctx.state.suggestSeen}`);
} catch (e) {
  log("ERROR:", e.message);
  await page.screenshot({ path: `${SHOT_DIR}/${NAME}-error.png` }).catch(() => {});
} finally {
  const vp = await page.video().path().catch(() => null);
  await context.close();
  await browser.close();
  log("video:", vp);

  if (vp) {
    const gif = `${SHOT_DIR}/${NAME}.gif`;
    const pal = `/tmp/pal-${NAME}.png`;
    const ss = trimFrom.toFixed(2);
    const vf = `fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`;
    log(`ffmpeg -> ${gif} (from ${ss}s, ${FPS}fps, ${WIDTH}px)`);
    execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", ss, "-i", vp,
      "-vf", `${vf},palettegen=stats_mode=diff`, pal]);
    execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", ss, "-i", vp, "-i", pal,
      "-lavfi", `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`, gif]);
    const size = readFileSync(gif).length;
    log(`GIF ready: ${gif} (${(size / 1048576).toFixed(2)} MB)  suggestSeen=${ctx.state.suggestSeen}`);
  }
  process.exit(ctx.state.suggestSeen || !S.expectSuggest ? 0 : 1);
}
