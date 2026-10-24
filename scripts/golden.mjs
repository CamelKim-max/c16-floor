#!/usr/bin/env node
// scripts/golden.mjs — the golden demo path test (the only acceptance signal).
// Steps come from fixtures/golden.json. Runs on the HOST (never inside an executor sandbox).
//
//   node scripts/golden.mjs --base <url> [--json] [--shots [dir]] [--fixture <path>] [--bail] [--headed]
//
// Output: one line per step, then `GOLDEN <pass>/<total> <ms>ms`.
// --json: prints ONLY {"pass","total","ms","steps":[{"name","ok","ms","err"}],...} on stdout.
// --shots [dir]: after the steps, saves <dir>/observe-390.png (390x844) and observe-1440.png (1440x900).
// Exit: 0 iff every step passed, 1 if any failed, 2 on usage/fixture error.
//
// Step types (fields in fixtures/golden.json):
//   http  method, path, body?, headers?, expect:{status?, json:{"dot.path": value}?, contains?[]}, save:{var:"dot.path"}?
//   poll  path, contains[] and/or expect.json, withinMs (5000), everyMs (250)    -> GET until it matches
//   page  path, viewport "390x844", expectText[], selector?, withinMs (8000), noConsoleErrors?, noHorizontalScroll?, shot?
//   any   budgetMs? -> fail if slower; timeoutMs? per request (10000)
// Strings may use {{nonce}} (unique per run) and {{var}} saved by earlier steps.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const o = { base: process.env.GOLDEN_BASE || "http://localhost:3000", json: false, shots: null, fixture: path.join(ROOT, "fixtures/golden.json"), bail: false, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) usage(`missing value for ${a}`);
      i++;
      return v;
    };
    if (a === "--base") o.base = next();
    else if (a === "--json") o.json = true;
    else if (a === "--shots") {
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith("--")) {
        o.shots = v;
        i++;
      } else o.shots = path.join(ROOT, "shots");
    } else if (a === "--fixture") o.fixture = next();
    else if (a === "--bail") o.bail = true;
    else if (a === "--headed") o.headed = true;
    else if (a === "--help" || a === "-h") usage();
    else if (!a.startsWith("--")) o.base = a;
    else usage(`unknown flag ${a}`);
  }
  o.base = o.base.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(o.base)) o.base = `https://${o.base}`;
  return o;
}

function usage(err) {
  const msg = "usage: node scripts/golden.mjs --base <url> [--json] [--shots [dir]] [--fixture <path>] [--bail] [--headed]";
  if (err) {
    console.error(`ERR: ${err}\n${msg}`);
    process.exit(2);
  }
  console.log(msg);
  process.exit(0);
}

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getPath(obj, dotted) {
  return dotted.split(".").reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

function fill(value, vars) {
  if (typeof value === "string") return value.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
  return value;
}

function checkJson(json, expected) {
  for (const [p, want] of Object.entries(expected ?? {})) {
    const got = getPath(json, p);
    if (JSON.stringify(got) !== JSON.stringify(want)) return `${p}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`;
  }
  return null;
}

function missing(text, needles) {
  return (needles ?? []).filter((n) => !text.includes(n));
}

async function request(base, step) {
  const init = {
    method: step.method || "GET",
    headers: { ...(step.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(step.headers ?? {}) },
    body: step.body !== undefined ? JSON.stringify(step.body) : undefined,
    signal: AbortSignal.timeout(step.timeoutMs ?? 10000),
    cache: "no-store",
  };
  const res = await fetch(base + step.path, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, text, json };
}

function parseViewport(v) {
  const [width, height] = String(v || "1440x900").split("x").map(Number);
  return { width: width || 1440, height: height || 900 };
}

// ---------------------------------------------------------------- browser (lazy)
let browserPromise = null;
function getBrowser(headed) {
  if (!browserPromise) {
    browserPromise = import("playwright")
      .then(({ chromium }) => chromium.launch({ headless: !headed }))
      .catch((e) => {
        throw new Error(`playwright chromium unavailable (run: npx playwright install chromium): ${String(e.message || e).split("\n")[0]}`);
      });
  }
  return browserPromise;
}

const IGNORED_CONSOLE = [/favicon/i, /Download the React DevTools/i];

// ---------------------------------------------------------------- step runners
async function runHttp(ctx, step) {
  const r = await request(ctx.base, step);
  const e = step.expect ?? {};
  if (e.status !== undefined) {
    const ok = Array.isArray(e.status) ? e.status.includes(r.status) : r.status === e.status;
    if (!ok) return `HTTP ${r.status} (expected ${JSON.stringify(e.status)}): ${r.text.slice(0, 200)}`;
  } else if (r.status >= 400) return `HTTP ${r.status}: ${r.text.slice(0, 200)}`;
  if (e.json) {
    if (r.json === null) return `response is not JSON: ${r.text.slice(0, 200)}`;
    const err = checkJson(r.json, e.json);
    if (err) return err;
  }
  const miss = missing(r.text, e.contains);
  if (miss.length) return `response missing ${JSON.stringify(miss)}`;
  for (const [name, p] of Object.entries(step.save ?? {})) {
    const v = getPath(r.json, p);
    if (v === undefined) return `save ${name}: no value at ${p}`;
    ctx.vars[name] = v;
  }
  return null;
}

async function runPoll(ctx, step) {
  const within = step.withinMs ?? 5000;
  const every = step.everyMs ?? 250;
  const t0 = Date.now();
  let last = "no response";
  while (true) {
    try {
      const r = await request(ctx.base, { ...step, method: "GET", body: undefined });
      if (r.status >= 400) last = `HTTP ${r.status}`;
      else {
        const miss = missing(r.text, step.contains);
        const jsonErr = step.expect?.json ? (r.json === null ? "not JSON" : checkJson(r.json, step.expect.json)) : null;
        if (!miss.length && !jsonErr) return null;
        last = miss.length ? `missing ${JSON.stringify(miss)}` : jsonErr;
      }
    } catch (e) {
      last = String(e.message || e);
    }
    if (Date.now() - t0 >= within) return `${last} after ${within}ms`;
    await sleep(every);
  }
}

async function runPage(ctx, step) {
  const browser = await getBrowser(ctx.headed);
  const context = await browser.newContext({ viewport: parseViewport(step.viewport) });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.some((re) => re.test(m.text()))) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const within = step.withinMs ?? 8000;
  try {
    await page.goto(ctx.base + step.path, { waitUntil: "domcontentloaded", timeout: within });
    if (step.selector) await page.waitForSelector(step.selector, { timeout: within });
    const texts = step.expectText ?? [];
    if (texts.length) {
      try {
        await page.waitForFunction((t) => t.every((x) => document.body && document.body.innerText.includes(x)), texts, { timeout: within, polling: 200 });
      } catch {
        const body = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
        return `page missing ${JSON.stringify(missing(body, texts))} after ${within}ms`;
      }
    }
    if (step.noHorizontalScroll) {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) return `horizontal overflow ${over}px at ${step.viewport}`;
    }
    if (step.shot && ctx.shotsDir) await page.screenshot({ path: path.join(ctx.shotsDir, `${step.shot}.png`) });
    if (step.noConsoleErrors && consoleErrors.length) return `console errors: ${consoleErrors.slice(0, 3).join(" | ").slice(0, 300)}`;
    return null;
  } finally {
    await context.close();
  }
}

async function takeShots(ctx) {
  const browser = await getBrowser(ctx.headed);
  const out = [];
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    try {
      await page.goto(`${ctx.base}/floor?mode=replay`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForSelector('[data-testid="timeline-item"]', { timeout: 5000 }).catch(() => {});
      await sleep(600);
      const file = path.join(ctx.shotsDir, `floor-${w}.png`);
      await page.screenshot({ path: file });
      out.push(file);
    } finally {
      await context.close();
    }
  }
  return out;
}

// ---------------------------------------------------------------- main
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(opts.fixture, "utf8"));
  } catch (e) {
    usage(`cannot read fixture ${opts.fixture}: ${e.message}`);
  }
  const steps = fixture.steps ?? [];
  if (!steps.length) usage(`no steps in ${opts.fixture}`);
  if (opts.shots) mkdirSync(opts.shots, { recursive: true });

  const ctx = {
    base: opts.base,
    headed: opts.headed,
    shotsDir: opts.shots,
    vars: { nonce: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` },
  };
  const runners = { http: runHttp, poll: runPoll, page: runPage };
  // Launch the browser up front so cold start (2-5 s) is not billed to the first page step.
  if (steps.some((s) => s.type === "page") || opts.shots) await getBrowser(opts.headed).catch(() => {});
  const results = [];
  const t0 = Date.now();
  let bailed = false;

  for (const [i, raw] of steps.entries()) {
    const step = fill(raw, ctx.vars);
    const name = step.name || `step ${i + 1}`;
    if (bailed) {
      results.push({ name, ok: false, ms: 0, err: "skipped (--bail)" });
      continue;
    }
    const s0 = Date.now();
    let err;
    try {
      const run = runners[step.type || "http"];
      err = run ? await run(ctx, step) : `unknown step type ${step.type}`;
    } catch (e) {
      err = String(e.message || e).split("\n")[0];
    }
    const ms = Date.now() - s0;
    if (!err && step.budgetMs && ms > step.budgetMs) err = `slow: ${ms}ms > budget ${step.budgetMs}ms`;
    results.push({ name, ok: !err, ms, err: err || "" });
    if (!opts.json) console.log(`${err ? "✗" : "✓"} ${i + 1} ${name} (${ms}ms)${err ? ` — ${err}` : ""}`);
    if (err && opts.bail) bailed = true;
  }

  const ms = Date.now() - t0;
  const pass = results.filter((r) => r.ok).length;
  let shots = [];
  if (opts.shots) {
    try {
      shots = await takeShots(ctx);
    } catch (e) {
      console.error(`WARN: shots failed: ${String(e.message || e).split("\n")[0]}`);
    }
  }
  if (browserPromise) await browserPromise.then((b) => b.close()).catch(() => {});

  if (opts.json) {
    console.log(JSON.stringify({ pass, total: results.length, ms, steps: results, base: opts.base, shots }));
  } else {
    if (shots.length) console.log(`SHOTS ${shots.join(" ")}`);
    console.log(`GOLDEN ${pass}/${results.length} ${ms}ms`);
  }
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`ERR: ${e?.stack || e}`);
  process.exit(2);
});
