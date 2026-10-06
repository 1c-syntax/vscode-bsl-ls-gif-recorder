// Assemble the feature catalog as ONE markdown file per provider (feature) from
// features.json + scenarios/*.json + descriptions.json.
//   RU files:  capabilities/<feature>.md          + capabilities/index.md      (index)
//   EN files:  en/capabilities/<feature>.md       + en/capabilities/index.md   (mkdocs EN site root)
// Each scenario is rendered as: short description (1-2 sentences) followed by its GIF.
// GIF src: if gif-urls.json has a public CDN URL (GitHub user-attachments, anchored by an
// asset-host issue) it is used — works on the docs site / GitHub / locally and keeps the
// ~190 MB of GIFs out of the repo. Otherwise falls back to a relative path
// (RU: ../output, EN: ../../output).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { ROOT } from "./engine.mjs";

const features = JSON.parse(readFileSync(`${ROOT}/features.json`, "utf8"));
const descriptions = existsSync(`${ROOT}/descriptions.json`)
  ? JSON.parse(readFileSync(`${ROOT}/descriptions.json`, "utf8"))
  : {};
const gifUrls = existsSync(`${ROOT}/gif-urls.json`)
  ? JSON.parse(readFileSync(`${ROOT}/gif-urls.json`, "utf8"))
  : {};

// collect scenarios that have a GIF (published URL or local render), grouped by feature
const byFeature = {};
for (const f of readdirSync(`${ROOT}/scenarios`).filter((n) => n.endsWith(".json"))) {
  const s = JSON.parse(readFileSync(`${ROOT}/scenarios/${f}`, "utf8"));
  if (!s.feature || !(gifUrls[s.name] || existsSync(`${ROOT}/output/${s.name}.gif`))) continue;
  (byFeature[s.feature] ||= []).push(s);
}
for (const k in byFeature) byFeature[k].sort((a, b) => a.name.localeCompare(b.name));

const order = Object.keys(features)
  .filter((k) => byFeature[k]?.length)
  .sort((a, b) => features[a].order - features[b].order);

const STR = {
  ru: {
    h1: "Возможности BSL Language Server",
    intro: "Каталог возможностей языкового сервера для 1С:Предприятие (BSL) и OneScript в редакторе с поддержкой LSP (примеры сняты в VS Code / code-server). Каждая возможность — в отдельном файле.",
    shortcut: "Горячие клавиши", back: "← Все возможности", index: "Возможности",
    navPrev: "Назад", navNext: "Вперёд",
    gifDir: "../output",
  },
  en: {
    h1: "BSL Language Server features",
    intro: "A catalog of the 1C:Enterprise (BSL) and OneScript language server features in an LSP-capable editor (demos captured in VS Code / code-server). Each feature lives in its own file.",
    shortcut: "Shortcut", back: "← All features", index: "Features",
    navPrev: "Back", navNext: "Next",
    gifDir: "../../output",
  },
};

// Russian descriptive shortcuts -> English for the EN pages (key combos pass through).
const SHORTCUT_EN = {
  "F12 / Ctrl+Click (просмотр: Alt+F12)": "F12 / Ctrl+Click (peek: Alt+F12)",
  "наведение мыши": "mouse hover",
  "Ctrl+Shift+M (панель Проблемы)": "Ctrl+Shift+M (Problems panel)",
  "автоматически": "automatic",
  "Показать иерархию типов (контекстное меню)": "Show Type Hierarchy (context menu)",
  "автоматически (клик по образцу — палитра)": "automatic (click the swatch to open the picker)",
  "Ctrl+клик по ссылке": "Ctrl+Click the link",
};
const shortcutFor = (f, lang) => (lang === "en" ? (SHORTCUT_EN[f.shortcut] ?? f.shortcut) : f.shortcut);

const L = (f, lang) => (lang === "en" ? f.en : f.ru);
const descOf = (name, lang) => (descriptions[name]?.[lang] ?? "").trim();
const missing = [];

function providerPage(key, lang, prevKey, nextKey) {
  const t = STR[lang];
  const f = features[key];
  const meta = L(f, lang);
  const scs = byFeature[key];

  const out = [`# ${meta.title}`, "", meta.desc, ""];
  if (f.shortcut) out.push(`**${t.shortcut}:** \`${shortcutFor(f, lang)}\``, "");
  out.push(`[${t.back}](index.md)`, "");

  const single = scs.length === 1;
  for (const s of scs) {
    const cap = lang === "en" ? (s.titleEn || s.title) : s.title;
    const desc = descOf(s.name, lang);
    if (!desc) missing.push(`${s.name}:${lang}`);
    if (!single) out.push(`## ${cap}`, "");
    if (desc) out.push(desc, "");
    const src = gifUrls[s.name] ?? `${t.gifDir}/${s.name}.gif`;
    out.push(`![${s.name}](${src})`, "");
  }

  // Навигация по соседним страницам каталога (порядок features.json).
  const nav = [];
  if (prevKey) nav.push(`[← ${t.navPrev}: ${L(features[prevKey], lang).title}](${prevKey}.md)`);
  if (nextKey) nav.push(`[${t.navNext}: ${L(features[nextKey], lang).title} →](${nextKey}.md)`);
  if (nav.length) out.push("---", "", nav.join("  ·  "), "");

  return out.join("\n");
}

function indexPage(lang) {
  const t = STR[lang];
  const out = [`# ${t.h1}`, "", t.intro, "", `## ${t.index}`, ""];
  for (const key of order) {
    const meta = L(features[key], lang);
    const count = byFeature[key].length;
    out.push(`- [${meta.title}](${key}.md) — ${meta.desc}`);
  }
  out.push("");
  return out.join("\n");
}

mkdirSync(`${ROOT}/capabilities`, { recursive: true });
mkdirSync(`${ROOT}/en/capabilities`, { recursive: true });
let n = 0;
order.forEach((key, i) => {
  const prevKey = order[i - 1];
  const nextKey = order[i + 1];
  writeFileSync(`${ROOT}/capabilities/${key}.md`, providerPage(key, "ru", prevKey, nextKey));
  writeFileSync(`${ROOT}/en/capabilities/${key}.md`, providerPage(key, "en", prevKey, nextKey));
  n++;
});
writeFileSync(`${ROOT}/capabilities/index.md`, indexPage("ru"));
writeFileSync(`${ROOT}/en/capabilities/index.md`, indexPage("en"));

console.log(`wrote ${n} provider files x2 langs + 2 indexes -> capabilities/ and en/capabilities/`);
console.log(`scenarios rendered: ${Object.values(byFeature).flat().length}`);
if (missing.length) console.log(`MISSING descriptions (${missing.length}): ${missing.join(", ")}`);
