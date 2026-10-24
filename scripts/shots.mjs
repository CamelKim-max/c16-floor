#!/usr/bin/env node
// scripts/shots.mjs — phone + desktop screenshots of any page (host only).
//   node scripts/shots.mjs <url> [name] [--dir shots] [--full] [--wait ms]
// Writes <dir>/<name>-390.png (390x844) and <dir>/<name>-1440.png (1440x900); prints the paths.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const pos = [];
let dir = path.join(ROOT, "shots");
let full = false;
let wait = 800;
let help = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dir") dir = args[++i];
  else if (args[i] === "--full") full = true;
  else if (args[i] === "--wait") wait = Number(args[++i]) || 0;
  else if (args[i] === "--help" || args[i] === "-h") help = true;
  else pos.push(args[i]);
}
if (help || !pos[0] || !dir) {
  console.log("usage: node scripts/shots.mjs <url> [name] [--dir shots] [--full] [--wait ms]");
  process.exit(help ? 0 : 2);
}
const url = /^https?:\/\//.test(pos[0]) ? pos[0] : `https://${pos[0]}`;
const name = pos[1] || new URL(url).pathname.replace(/^\/+|\/+$/g, "").replace(/[^\w-]+/g, "-") || "home";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("ERR: playwright not installed (npm install; npx playwright install chromium)");
  process.exit(2);
}

mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
let failed = false;
try {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      if (wait) await page.waitForTimeout(wait);
      const file = path.join(dir, `${name}-${w}.png`);
      await page.screenshot({ path: file, fullPage: full });
      console.log(file);
    } catch (e) {
      failed = true;
      console.error(`ERR: ${w}px: ${String(e.message || e).split("\n")[0]}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
