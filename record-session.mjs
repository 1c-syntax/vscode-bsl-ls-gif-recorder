// Warm-session batch recorder: opens ONE workspace, warms the LS context ONCE,
// then runs many scenarios in the same hot session (no per-GIF re-warm), recording
// a single video that is sliced into per-scenario GIFs by step timestamps.
//
// Usage: node record-session.mjs sessions/<group>.json
//   group json: { "workspace": "/home/coder/project/bsl-demo", "warmupMs": 90000,
//                 "scenarios": ["hover-01-method", "folding-01", ...] }
//
// Each scenario is loaded from scenarios/<name>.json. All scenarios in a group must
// share the same workspace. See RUNBOOK.md.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { ROOT, CODE_SERVER_URL, sleep, log, waitForReady, closeChat, openFile, resetEditors, runStep } from "./engine.mjs";

const PROJECT = `${ROOT}/workspace`;
const SHOT_DIR = `${ROOT}/output`;
const VIDEO_DIR = `${ROOT}/videos`;
for (const d of [SHOT_DIR, VIDEO_DIR]) mkdirSync(d, { recursive: true });

const groupPath = process.argv[2];
if (!groupPath) { console.error("usage: node record-session.mjs sessions/<group>.json"); process.exit(2); }
const G = JSON.parse(readFileSync(groupPath, "utf8"));
const WORKSPACE = G.workspace ?? "/home/coder/project";
const WARMUP = G.warmupMs ?? 180000;
const hostWorkspace = WORKSPACE.replace("/home/coder/project", PROJECT);
const URL = `${CODE_SERVER_URL}/?folder=${encodeURIComponent(WORKSPACE)}`;
const scenarios = G.scenarios.map((n) => JSON.parse(readFileSync(`${ROOT}/scenarios/${n}.json`, "utf8")));

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
});
const videoT0 = Date.now();                 // ≈ video frame 0 (context creation)
const page = await context.newPage();
const segments = [];

try {
  log(`session "${groupPath}" (${scenarios.length} scenarios) -> ${WORKSPACE}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".monaco-workbench", { timeout: 60000 });
  await sleep(4000);
  await closeChat(page);

  log(`warming LS context once (max ${WARMUP}ms)…`);
  const ready = await waitForReady(page, WARMUP);
  log(ready ? "context ready (warm for the whole session)" : "warmup TIMED OUT — continuing");

  for (let i = 0; i < scenarios.length; i++) {
    const S = scenarios[i];
    const NAME = S.name;
    const LEAD = S.leadSec ?? 1.0;
    const ctx = { shotDir: SHOT_DIR, name: NAME, state: { suggestSeen: false } };
    log(`--- [${i + 1}/${scenarios.length}] ${NAME}`);

    await resetEditors(page);  // also before the first scenario: clears ghost tabs/dirty buffers left server-side by prior browser sessions
    if (typeof S.content === "string") {
      const fixture = S.fixture || "demo.bsl";
      writeFileSync(`${hostWorkspace}/${fixture}`, S.content);
    }
    await openFile(page, S.openQuery || S.fixture || "demo.bsl");
    await waitForReady(page, 20000);          // fast no-op when already warm

    const startMs = Date.now();
    for (const st of S.steps) { log(`    step: ${JSON.stringify(st)}`); await runStep(page, st, ctx); }
    const endMs = Date.now();

    segments.push({
      name: NAME,
      startSec: Math.max(0, (startMs - videoT0) / 1000 - LEAD),
      endSec: (endMs - videoT0) / 1000 + 0.8,
      fps: S.fps ?? 12,
      width: S.width ?? 960,
      suggestSeen: ctx.state.suggestSeen,
    });
    log(`    done (suggestSeen=${ctx.state.suggestSeen})`);
  }
  // Discard any unsaved buffer from the LAST scenario so a committing/mutating
  // scenario (rename, color pick, typing) can't get persisted to a fixture on disk.
  await resetEditors(page).catch(() => {});
} catch (e) {
  log("ERROR:", e.message);
  await page.screenshot({ path: `${SHOT_DIR}/session-error.png` }).catch(() => {});
} finally {
  const vp = await page.video().path().catch(() => null);
  await context.close();
  await browser.close();
  log("video:", vp);

  if (vp) {
    for (const seg of segments) {
      const gif = `${SHOT_DIR}/${seg.name}.gif`;
      const pal = `/tmp/pal-${seg.name}.png`;
      const dur = Math.max(0.5, seg.endSec - seg.startSec).toFixed(2);
      const ss = seg.startSec.toFixed(2);
      const vf = `fps=${seg.fps},scale=${seg.width}:-1:flags=lanczos`;
      log(`ffmpeg -> ${seg.name}.gif (ss=${ss}s dur=${dur}s ${seg.fps}fps ${seg.width}px)`);
      try {
        execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", ss, "-t", dur, "-i", vp,
          "-vf", `${vf},palettegen=stats_mode=diff`, pal]);
        execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", ss, "-t", dur, "-i", vp, "-i", pal,
          "-lavfi", `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`, gif]);
        const size = readFileSync(gif).length;
        log(`  GIF ${seg.name}.gif (${(size / 1048576).toFixed(2)} MB) suggestSeen=${seg.suggestSeen}`);
      } catch (e) { log(`  ffmpeg failed for ${seg.name}: ${e.message}`); }
    }
  }
  log("SESSION_DONE");
  process.exit(0);
}
