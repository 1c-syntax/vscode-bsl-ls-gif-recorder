// Shared driving engine for the BSL LSP demo recorders.
// Used by record.mjs (single scenario) and record-session.mjs (warm-session batch).
// See RUNBOOK.md.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root (this file lives in it); all host-side paths are resolved from here.
export const ROOT = dirname(fileURLToPath(import.meta.url));
// code-server started by scripts/start-codeserver.sh (host port 8090 by default).
export const CODE_SERVER_URL = (process.env.CODE_SERVER_URL || "http://127.0.0.1:8090").replace(/\/$/, "");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

// bsl-language-server reports context-building progress in the status bar through
// two phases; readiness = none of these in-progress phrases is shown (stable).
const BUSY = /(Ищем файлы для наполнения|Наполняем контекст|Рассчитываем данные конфигурации)[^\n]*?(\d+\/\d+)?/;

export async function statusText(page) {
  return await page.evaluate(() => {
    const sb = document.querySelector(".part.statusbar");
    return sb ? sb.innerText.replace(/\s+/g, " ") : "";
  }).catch(() => "");
}

export async function waitForReady(page, maxMs, { settleMs = 2500, appearMs = 15000 } = {}) {
  const start = Date.now();
  let sawBusy = false, lastMsg = "";
  while (Date.now() - start < maxMs) {
    const m = (await statusText(page)).match(BUSY);
    if (m) {
      sawBusy = true;
      const msg = m[0].trim();
      if (msg !== lastMsg) { log(`  LS: ${msg}`); lastMsg = msg; }
      await sleep(1000); continue;
    }
    if (sawBusy || Date.now() - start > appearMs) {
      await sleep(settleMs);
      if (!BUSY.test(await statusText(page))) return true;
      continue;
    }
    await sleep(1000);
  }
  return false;
}

export async function waitSuggest(page, maxMs = 20000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await page.locator(".suggest-widget.visible").count().then((c) => c > 0).catch(() => false)) return true;
    await sleep(400);
  }
  return false;
}

export async function runCommand(page, text, waitMs = 1500) {
  await page.keyboard.press("Control+Shift+KeyP"); await sleep(800);
  await page.keyboard.type(text, { delay: 40 }); await sleep(900);
  await page.keyboard.press("Enter"); await sleep(waitMs);
}

// Close the GitHub Copilot / "Build with Agent" chat (secondary side bar) so it
// doesn't take screen space / appear in recordings. Idempotent: only toggles if open.
export async function closeChat(page) {
  const auxVisible = await page.evaluate(() => {
    const el = document.querySelector(".part.auxiliarybar");
    return !!el && el.getBoundingClientRect().width > 20;
  }).catch(() => false);
  if (auxVisible) {
    log("  closing chat (secondary side bar)");
    await page.keyboard.press("Control+Alt+KeyB"); await sleep(800);
  }
}

// Open a file via Quick Open. Some code-server builds don't open on Enter from a
// fuzzy multi-match list (palette stays open) → fall back to clicking the top row.
export async function openFile(page, openQuery) {
  log(`quick-open ${openQuery}`);
  await page.keyboard.press("Control+KeyP"); await sleep(1500);
  await page.keyboard.type(openQuery, { delay: 60 }); await sleep(2200);
  await page.keyboard.press("Enter"); await sleep(1800);
  if (await page.locator(".quick-input-widget").isVisible().catch(() => false)) {
    log("  quick-open still open after Enter — clicking top result");
    await page.locator(".quick-input-list .monaco-list-row").first()
      .click({ timeout: 5000 }).catch(() => {});
    await sleep(1800);
  }
  // Click the main code editor to focus it. Scope to the editor part so we never
  // match the (hidden) chat input's .monaco-editor, which broke focus after a reset.
  await page.locator(".part.editor .monaco-editor").first()
    .click({ timeout: 30000 }).catch((e) => log(`  editor focus click err: ${e.message}`));
  // code-server keeps a dirty buffer server-side across browser sessions (even with
  // hotExit off), so a freshly-written fixture can show STALE content. Revert to
  // force-load the on-disk version. No-op for clean/real files.
  await runCommand(page, "Revert File", 400);
}

// Reset editor state between scenarios in a shared warm session: drop popups/peeks,
// discard unsaved edits (so a dirty buffer can't bleed into the next scenario), then
// close all editors so the next file opens fresh from disk.
export async function resetEditors(page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await sleep(150); }
  await runCommand(page, "Revert File", 500);              // discard unsaved edits
  await runCommand(page, "View: Close All Editors", 700);  // empty the editor area
  // Close the bottom panel (Problems/terminal) if open — DOM-checked Ctrl+J is more
  // reliable here than the "View: Close Panel" command, which proved flaky.
  const panelVisible = await page.evaluate(() => {
    const el = document.querySelector(".part.panel");
    return !!el && el.getBoundingClientRect().height > 20;
  }).catch(() => false);
  if (panelVisible) { await page.keyboard.press("Control+KeyJ"); await sleep(400); }
  await runCommand(page, "View: Show Explorer", 500);      // hide the call-hierarchy/references view
}

// Execute one scenario step. ctx = { shotDir, name, state:{suggestSeen} }.
export async function runStep(page, st, ctx) {
  switch (st.action) {
    case "cursorEnd":  await page.keyboard.press("Control+End"); break;
    case "cursorTop":  await page.keyboard.press("Control+Home"); break;
    case "goto":
      await page.keyboard.press("Control+KeyG"); await sleep(500);
      await page.keyboard.type(`${st.line}:${st.column ?? 1}`); await sleep(300);
      await page.keyboard.press("Enter"); await sleep(400); break;
    case "lineEnd":
      await page.keyboard.press("Control+KeyG"); await sleep(500);
      await page.keyboard.type(`${st.line}`); await sleep(300);
      await page.keyboard.press("Enter"); await sleep(400);
      await page.keyboard.press("End"); await sleep(200); break;
    case "find":
      await page.keyboard.press("Control+KeyF"); await sleep(600);
      await page.keyboard.type(st.text, { delay: 80 }); await sleep(800);
      for (let i = 0; i < (st.next ?? 0); i++) { await page.keyboard.press("Enter"); await sleep(400); }
      await page.keyboard.press("Escape"); await sleep(400); break;
    case "type":       await page.keyboard.type(st.text, { delay: st.delay ?? 150 }); break;
    case "key":        for (let i = 0; i < (st.times ?? 1); i++) { await page.keyboard.press(st.key); await sleep(st.gapMs ?? 250); } break;
    case "suggest":
      for (let i = 0; i < (st.tries ?? 6); i++) {
        await page.keyboard.press("Control+Space");
        if (await waitSuggest(page, st.maxMs ?? 3000)) { ctx.state.suggestSeen = true; break; }
        log(`  suggest retry ${i + 1}`);
      } break;
    case "waitSuggest": if (await waitSuggest(page, st.maxMs ?? 8000)) ctx.state.suggestSeen = true; break;
    case "command":
      await runCommand(page, st.text, st.waitMs ?? 1800); break;
    case "peek":
      await page.keyboard.press("Alt+F12"); await sleep(2200);
      if (!(await page.locator(".zone-widget").count().catch(() => 0))) {
        log("  Alt+F12 не открыл peek — фолбэк через палитру команд");
        await runCommand(page, "Peek Definition", 2200);
      }
      break;
    case "hover": {
      const box = await page.locator(".monaco-editor .cursors-layer .cursor").first()
        .boundingBox().catch(() => null);
      if (box) {
        if (st.ctrl) await page.keyboard.down("Control");   // Ctrl+hover surfaces document links
        // Monaco only triggers a hover on a fresh mouse-ENTER over the token: move the mouse
        // AWAY first, then glide into the token, otherwise the hover never displays.
        await page.mouse.move(box.x + 220, box.y + 140, { steps: 3 }); await sleep(300);
        await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2, { steps: 12 });
        const deadline = Date.now() + (st.maxMs ?? 7000);
        // wait for the DISPLAYED hover (the shown widget has a non-zero box; sibling measuring
        // nodes are display:none with width 0).
        while (Date.now() < deadline) {
          const has = await page.evaluate(() => [...document.querySelectorAll(".monaco-hover")]
            .some((e) => e.getBoundingClientRect().width > 0 && (e.textContent || "").trim().length > 0)).catch(() => false);
          if (has) break;
          await sleep(300);
        }
        // capture while Ctrl is still held (the link underline/tooltip disappears on release)
        if (st.shot) await page.screenshot({ path: `${ctx.shotDir}/${ctx.name}-${st.shot}.png` });
        if (st.ctrl) await page.keyboard.up("Control");
      } else { log("  hover: cursor box not found"); }
      await sleep(st.settleMs ?? 600); break;
    }
    case "doubleClick": {   // double-click at the cursor position to select the word (makes occurrence highlights visible)
      const box = await page.locator(".monaco-editor .cursors-layer .cursor").first()
        .boundingBox().catch(() => null);
      if (box) await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(st.waitMs ?? 1200); break;
    }
    case "ctrlClick": {
      const box = await page.locator(".monaco-editor .cursors-layer .cursor").first()
        .boundingBox().catch(() => null);
      if (box) {
        await page.keyboard.down("Control");
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.keyboard.up("Control");
      }
      await sleep(st.waitMs ?? 1500); break;
    }
    case "click": {
      if (st.text) {           // click an element by visible text (e.g. a CodeLens link)
        await page.getByText(st.text, { exact: false }).first().click({ timeout: st.maxMs ?? 5000 })
          .catch((e) => log(`  click text '${st.text}' err: ${e.message}`));
      } else {
        const sel = st.aria ? `[aria-label="${st.aria}"]`
          : st.title ? `[title="${st.title}"]`
          : st.selector;
        if (sel) await page.locator(sel).first().click({ timeout: st.maxMs ?? 5000 })
          .catch((e) => log(`  click '${sel}' err: ${e.message}`));
      }
      await sleep(st.waitMs ?? 1200); break;
    }
    case "colorPicker": {   // open the color picker on a color literal, optionally pick a new color
      const deco = page.locator(".colorpicker-color-decoration").nth(st.index ?? 0);
      let opened = false;
      if (await deco.count().catch(() => 0)) {
        await deco.click({ timeout: 4000 }).catch((e) => log(`  swatch click err: ${e.message}`));
        await sleep(1500);
        opened = await page.locator(".colorpicker-body").first().isVisible().catch(() => false);
      }
      if (!opened) {        // fallback: hover the color value to surface the picker via hover
        const box = await page.locator(".monaco-editor .cursors-layer .cursor").first().boundingBox().catch(() => null);
        if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 }); await sleep(1600); }
      }
      if (st.pick) {        // click inside the saturation box to change the color → code updates
        const sat = page.locator(".colorpicker-body .saturation-box").first();
        if (await sat.count().catch(() => 0)) {
          const b = await sat.boundingBox();
          if (b) { await page.mouse.click(b.x + b.width * (st.px ?? 0.35), b.y + b.height * (st.py ?? 0.3)); await sleep(1000); }
        } else { log("  colorPicker: saturation-box not found"); }
      }
      if (st.convert) {       // toggle the color PRESENTATION (web ↔ RGB constructor) PRESERVING the color.
        // Clicking .picked-color cycles between presentations; the editor flush is debounced,
        // so retry until the web literal (st.convert substring) is gone from the editor.
        const gone = st.convert;
        for (let i = 0; i < (st.tries ?? 4); i++) {
          const pc = page.locator(".colorpicker-header .picked-color").first();
          if (await pc.count().catch(() => 0)) await pc.click({ timeout: 3000 }).catch((e) => log(`  picked-color click err: ${e.message}`));
          else { log("  colorPicker: picked-color not found"); break; }
          await sleep(1200);
          const txt = await page.evaluate(() => [...document.querySelectorAll(".view-line")].map((r) => r.textContent).join("\n")).catch(() => "");
          if (typeof gone === "string" && gone && !txt.includes(gone)) { log(`  converted (gone: ${gone})`); break; }
        }
      }
      await sleep(st.waitMs ?? 900); break;
    }
    case "documentLink": {  // surface an LSP DocumentLink (over a diagnostic range) and Ctrl+hover it.
      // code-server renders provider links lazily — they appear only after a model change +
      // viewport refresh, so nudge with a no-op edit (space+Backspace) + tiny scroll, retrying
      // until the target token (st.linkText, e.g. a magic number) becomes a .detected-link.
      const target = st.linkText;
      let ok = false;
      for (let i = 0; i < (st.tries ?? 6) && !ok; i++) {
        await page.keyboard.press("Control+End"); await sleep(200);
        await page.keyboard.type(" "); await sleep(400); await page.keyboard.press("Backspace"); await sleep(1400);
        await page.mouse.move(640, 220); await page.mouse.wheel(0, 80); await sleep(800); await page.mouse.wheel(0, -80); await sleep(1600);
        ok = await page.evaluate((t) => [...document.querySelectorAll(".detected-link, .detected-link-active")].some((e) => e.textContent.includes(t)), target).catch(() => false);
        if (!ok) log(`  documentLink load retry ${i + 1}`);
      }
      if (!ok) log(`  documentLink: link '${target}' did not render`);
      const rect = await page.evaluate((t) => {
        const el = [...document.querySelectorAll(".view-line span")].find((e) => e.textContent.trim() === t);
        if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, target).catch(() => null);
      if (rect) {
        await page.keyboard.down("Control");
        await page.mouse.move(rect.x, rect.y, { steps: 8 });
        await sleep(st.maxMs ?? 2600);
        if (st.shot) await page.screenshot({ path: `${ctx.shotDir}/${ctx.name}-${st.shot}.png` });
        await page.keyboard.up("Control");
      } else { log("  documentLink: target token not found in view"); }
      await sleep(st.settleMs ?? 800); break;
    }
    case "pause":      await sleep(st.ms ?? 1000); break;
    case "shot":       await page.screenshot({ path: `${ctx.shotDir}/${ctx.name}-${st.name}.png` }); break;
    default:           log(`  ! unknown action: ${st.action}`);
  }
}
