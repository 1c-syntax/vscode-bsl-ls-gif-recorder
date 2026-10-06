// Probe: open the SSL configuration in code-server and watch for LS readiness
// signals — status-bar progress spinners, progress notifications, and the
// moment cross-module Go to Definition starts resolving. Measures indexing time.
import { chromium } from "playwright";
import { CODE_SERVER_URL } from "../../engine.mjs";

const URL = `${CODE_SERVER_URL}/?folder=` + encodeURIComponent("/home/coder/project");
const FILE = "src/cf/CommonModules/СерверныеОповещения/Ext/Module.bsl";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const t0 = Date.now();

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".monaco-workbench", { timeout: 60000 });
await sleep(4000);
log("workbench loaded; opening file");
await page.keyboard.press("Control+KeyP"); await sleep(1500);
await page.keyboard.type(FILE, { delay: 50 }); await sleep(2500);
await page.keyboard.press("Enter"); await sleep(3000);
await page.click(".monaco-editor", { timeout: 30000 });
log("file opened; polling readiness signals…");

async function probe() {
  return await page.evaluate(() => {
    const sb = document.querySelector(".part.statusbar");
    const spins = document.querySelectorAll(".part.statusbar .codicon-modifier-spin, .monaco-progress-container:not(.done)").length;
    const sbText = sb ? sb.innerText.replace(/\s+/g, " ").trim().slice(0, 160) : "";
    const notif = Array.from(document.querySelectorAll(".notification-list-item-message")).map(n => n.innerText).join(" | ").slice(0, 160);
    return { spins, sbText, notif };
  }).catch(() => ({ spins: -1, sbText: "(eval failed)", notif: "" }));
}

let lastSig = "";
for (let i = 0; i < 60; i++) {           // up to ~5 min
  const p = await probe();
  const sig = `spins=${p.spins} | sb="${p.sbText}"` + (p.notif ? ` | notif="${p.notif}"` : "");
  if (sig !== lastSig) { log(sig); lastSig = sig; }
  await sleep(5000);
}

// final: does cross-module F12 resolve now?
log("final F12 check");
await page.keyboard.press("Control+KeyG"); await sleep(500);
await page.keyboard.type("326:51"); await sleep(300);
await page.keyboard.press("Enter"); await sleep(800);
await page.keyboard.press("F12"); await sleep(3000);
const where = await page.evaluate(() => {
  const bc = document.querySelector(".monaco-breadcrumbs");
  const tab = document.querySelector(".tab.active .label-name");
  return { tab: tab?.textContent, breadcrumb: bc?.innerText?.replace(/\s+/g, " ").slice(0, 120) };
});
log("after F12:", JSON.stringify(where));
await browser.close();
