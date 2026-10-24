import { choosePlay, normalizeSignals } from "@/lib/coach";
import {
  READ,
  type Read,
  type ReadRequest,
  type ReadResponse,
  type ShopperRead,
} from "@/lib/contract";
import { readFrame } from "@/lib/vision";

export const runtime = "nodejs";
export const maxDuration = 30;

function respond(body: ReadResponse, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return respond({ ok: false, error: "invalid JSON" }, 400);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return respond({ ok: false, error: "invalid body" }, 400);
  }
  if (!("zone" in parsed) || typeof parsed.zone !== "string"
    || parsed.zone.trim().length < 1 || parsed.zone.length > 20) {
    return respond({ ok: false, error: "invalid zone" }, 400);
  }

  const hasImage = "image" in parsed;
  const hasSignals = "signals" in parsed;
  if (hasImage === hasSignals) {
    return respond({ ok: false, error: "provide exactly one of image or signals" }, 400);
  }
  if ("image" in parsed) {
    if (typeof parsed.image !== "string") {
      return respond({ ok: false, error: "invalid image" }, 400);
    }
    if (parsed.image.length > READ.maxImageBytes) {
      return respond({ ok: false, error: "image too large" }, 413);
    }
    if (!parsed.image.startsWith("data:image/jpeg;base64,")) {
      return respond({ ok: false, error: "invalid image" }, 413);
    }
  }
  if ("signals" in parsed && (!Array.isArray(parsed.signals)
    || parsed.signals.length < 1 || parsed.signals.length > READ.maxShoppers)) {
    return respond({ ok: false, error: "invalid signals" }, 400);
  }

  const body = parsed as ReadRequest;
  let shoppers: ShopperRead[];
  if (body.signals !== undefined) {
    shoppers = body.signals.map((value) => {
      const dwellSec = value !== null && typeof value === "object"
        ? value.dwellSec ?? body.dwellSec ?? 0 : body.dwellSec ?? 0;
      return normalizeSignals(value, dwellSec);
    }).map((signals, index) => ({
      track: String.fromCharCode(65 + index),
      signals,
      play: choosePlay(signals),
    }));
  } else {
    try {
      const observed = await readFrame(body.image!);
      const signals = observed.map((value) => normalizeSignals(value, body.dwellSec ?? 0));
      if (signals.every((value) => value.x !== undefined)) {
        signals.sort((left, right) => left.x! - right.x!);
      }
      shoppers = signals.slice(0, READ.maxShoppers).map((signals, index) => ({
        track: String.fromCharCode(65 + index),
        signals,
        play: choosePlay(signals),
      }));
    } catch {
      return respond({ ok: false, error: "vision failed" }, 502);
    }
  }

  const read: Read = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    zone: body.zone,
    mode: hasImage ? "live" : "signals",
    ms: Math.round(performance.now() - startedAt),
    shoppers,
  };
  return respond({ ok: true, read });
}
