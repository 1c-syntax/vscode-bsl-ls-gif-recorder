// Build a self-contained HTML catalog (animated GIFs) and zip it.
// Produces dist/index.html + dist/gifs/<name>.gif, then FEATURES-html.zip.
// Unlike the PDF, GIFs here animate (open index.html in a browser). See RUNBOOK.md.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ROOT } from "./engine.mjs";

const DIST = `${ROOT}/dist`;
rmSync(DIST, { recursive: true, force: true });
mkdirSync(`${DIST}/gifs`, { recursive: true });
const features = JSON.parse(readFileSync(`${ROOT}/features.json`, "utf8"));

const byFeature = {};
for (const f of readdirSync(`${ROOT}/scenarios`).filter((n) => n.endsWith(".json"))) {
  const s = JSON.parse(readFileSync(`${ROOT}/scenarios/${f}`, "utf8"));
  if (!s.feature || !existsSync(`${ROOT}/output/${s.name}.gif`)) continue;
  (byFeature[s.feature] ||= []).push(s);
}
for (const k in byFeature) byFeature[k].sort((a, b) => a.name.localeCompare(b.name));
const order = Object.keys(features).sort((a, b) => features[a].order - features[b].order);

const slug = (s) => s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const toc = [], sections = [];
for (const key of order) {
  const f = features[key], meta = f.ru, scs = byFeature[key] || [];
  if (!scs.length) continue;
  const id = slug(meta.title);
  toc.push(`<a href="#${id}">${esc(meta.title)}</a>`);
  let body = `<h2 id="${id}">${esc(meta.title)}</h2><p class="desc">${esc(meta.desc)}</p>`;
  if (f.shortcut) body += `<p class="sc">Горячие клавиши <code>${esc(f.shortcut)}</code></p>`;
  for (const s of scs) {
    copyFileSync(`${ROOT}/output/${s.name}.gif`, `${DIST}/gifs/${s.name}.gif`);
    const cap = scs.length > 1 ? `<div class="cap">${esc(s.title)}</div>` : "";
    body += `<figure>${cap}<img loading="lazy" src="gifs/${s.name}.gif" alt="${esc(s.title)}"/></figure>`;
  }
  body += `<a class="totop" href="#toc">↑ наверх</a>`;
  sections.push(`<section>${body}</section>`);
}

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Возможности BSL Language Server</title>
<style>
  :root { --bg:#0f1420; --card:#171d2b; --fg:#e6e9ef; --muted:#9aa4b6; --accent:#7aa2f7; --line:#283041; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 -apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
  .wrap { max-width:1180px; margin:0 auto; padding:32px 20px 80px; }
  h1 { font-size:30px; margin:0 0 6px; }
  .lead { color:var(--muted); margin:0 0 24px; max-width:860px; }
  .toc { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:6px 18px;
         background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 22px; margin:0 0 36px; }
  .toc a { color:var(--accent); text-decoration:none; font-size:14px; padding:2px 0; }
  .toc a:hover { text-decoration:underline; }
  section { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:22px 24px; margin:0 0 22px; scroll-margin-top:16px; }
  h2 { font-size:21px; margin:0 0 6px; }
  .desc { color:#c6ccd8; margin:6px 0 10px; }
  .sc { color:var(--muted); font-size:13px; margin:0 0 14px; }
  code { background:#0c1019; border:1px solid var(--line); border-radius:5px; padding:2px 7px; font:13px ui-monospace,Menlo,Consolas,monospace; color:#f7a; }
  figure { margin:14px 0 0; }
  .cap { font-weight:600; color:#cdd3df; margin:14px 0 6px; }
  img { width:100%; border:1px solid var(--line); border-radius:8px; display:block; }
  .totop { display:inline-block; margin-top:12px; color:var(--accent); text-decoration:none; font-size:13px; }
  .totop:hover { text-decoration:underline; }
  footer { color:var(--muted); font-size:13px; margin-top:30px; text-align:center; }
</style></head><body><div class="wrap">
  <h1>Возможности BSL Language Server</h1>
  <p class="lead">Каталог возможностей языкового сервера для 1С:Предприятие (BSL) в редакторе с поддержкой LSP. Все демонстрации — анимированные GIF (сняты в code-server, тема One Dark Pro). Откройте этот файл в браузере.</p>
  <nav class="toc" id="toc">${toc.join("")}</nav>
  ${sections.join("\n")}
  <footer>BSL Language Server — 1c-syntax. Сгенерировано автоматически из сценариев.</footer>
</div></body></html>`;

writeFileSync(`${DIST}/index.html`, html);
execFileSync("zip", ["-r", "-q", `${ROOT}/FEATURES-html.zip`, "index.html", "gifs"], { cwd: DIST });
const n = sections.length, g = readdirSync(`${DIST}/gifs`).length;
const kb = (readFileSync(`${ROOT}/FEATURES-html.zip`).length / 1048576).toFixed(1);
console.log(`dist/index.html: ${n} sections, ${g} gifs -> FEATURES-html.zip (${kb} MB)`);
