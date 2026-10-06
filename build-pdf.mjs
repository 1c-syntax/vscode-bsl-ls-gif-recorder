// Build a PDF catalog (FEATURES.ru.pdf) from features.json + scenarios.
// PDFs can't animate GIFs, so each scenario is represented by its final captured
// key frame (the newest output/<name>-*.png shot; falls back to the GIF's last
// frame). Rendered to PDF via headless Chromium. See RUNBOOK.md.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { ROOT } from "./engine.mjs";

const OUT = `${ROOT}/output`;
const TMP = "/tmp/pdfframes";
mkdirSync(TMP, { recursive: true });
const features = JSON.parse(readFileSync(`${ROOT}/features.json`, "utf8"));

const byFeature = {};
for (const f of readdirSync(`${ROOT}/scenarios`).filter((n) => n.endsWith(".json"))) {
  const s = JSON.parse(readFileSync(`${ROOT}/scenarios/${f}`, "utf8"));
  if (!s.feature || !existsSync(`${OUT}/${s.name}.gif`)) continue;
  (byFeature[s.feature] ||= []).push(s);
}
for (const k in byFeature) byFeature[k].sort((a, b) => a.name.localeCompare(b.name));
const order = Object.keys(features).sort((a, b) => features[a].order - features[b].order);

// Pick the representative still for a scenario: newest <name>-*.png shot, else last GIF frame.
function stillFor(name) {
  const shots = readdirSync(OUT)
    .filter((n) => n.startsWith(`${name}-`) && n.endsWith(".png") && !n.endsWith("-error.png"))
    .map((n) => ({ n, t: statSync(`${OUT}/${n}`).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (shots.length) return `${OUT}/${shots[0].n}`;
  const frame = `${TMP}/${name}.png`;
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", `${OUT}/${name}.gif`,
    "-vf", "reverse", "-frames:v", "1", frame]);   // last frame
  return frame;
}
const dataUri = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sections = [];
const toc = [];
for (const key of order) {
  const f = features[key];
  const meta = f.ru;
  const scs = byFeature[key] || [];
  if (!scs.length) continue;
  toc.push(esc(meta.title));
  let body = `<h2>${esc(meta.title)}</h2><p class="desc">${esc(meta.desc)}</p>`;
  if (f.shortcut) body += `<p class="sc"><span>Горячие клавиши</span> <code>${esc(f.shortcut)}</code></p>`;
  for (const s of scs) {
    const cap = scs.length > 1 ? `<div class="cap">${esc(s.title)}</div>` : "";
    body += `<figure>${cap}<img src="${dataUri(stillFor(s.name))}"/></figure>`;
  }
  body += `<a class="totop" href="#toc">↑ наверх</a>`;
  sections.push(`<section>${body}</section>`);
}

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1c2230; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .lead { color: #5b6472; margin: 0 0 18px; }
  .toc { columns: 2; font-size: 12px; color: #2b3b4d; margin: 0 0 8px; padding: 0; list-style: none; }
  .toc li { padding: 2px 0; break-inside: avoid; }
  .toc li::before { content: "▸ "; color: #8a94a6; }
  h2 { font-size: 17px; margin: 0 0 2px; color: #0f1626; border-bottom: 2px solid #eceef2; padding-bottom: 4px; }
  section { break-inside: avoid; margin: 0 0 16px; }
  .desc { margin: 6px 0; color: #39414f; }
  .sc { margin: 4px 0 8px; font-size: 12px; }
  .sc span { color: #6b7280; }
  code { background: #f1f3f7; border: 1px solid #e4e7ee; border-radius: 4px; padding: 1px 6px; font: 12px ui-monospace, Menlo, Consolas, monospace; color: #b3306b; }
  figure { margin: 8px 0; break-inside: avoid; }
  .cap { font-size: 12px; font-weight: 600; color: #2b3b4d; margin: 8px 0 3px; }
  img { width: 100%; border: 1px solid #d7dbe3; border-radius: 6px; display: block; }
  .cover { margin-bottom: 16px; }
  .totop { display: inline-block; margin-top: 6px; font-size: 11px; color: #2b6cb0; text-decoration: none; }
</style></head><body>
  <div class="cover">
    <h1>Возможности BSL Language Server</h1>
    <p class="lead">Каталог возможностей языкового сервера для 1С:Предприятие (BSL) в редакторе с поддержкой LSP. Кадры сняты в code-server (тема One Dark Pro). PDF показывает ключевой кадр каждой демонстрации; анимированные версии — в output/*.gif.</p>
    <ul class="toc" id="toc">${toc.map((t) => `<li>${t}</li>`).join("")}</ul>
  </div>
  ${sections.join("\n")}
</body></html>`;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newContext({ viewport: { width: 1000, height: 1400 } }).then((c) => c.newPage());
await page.setContent(html, { waitUntil: "load" });
const pdf = `${ROOT}/FEATURES.ru.pdf`;
await page.pdf({ path: pdf, format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } });
await browser.close();
const kb = (readFileSync(pdf).length / 1024).toFixed(0);
console.log(`wrote ${pdf} (${kb} KB), ${sections.length} feature sections`);
