import { buzz } from "@/lib/buzz";
import { FEATURES } from "@/lib/config";

export const runtime = "nodejs";

let lastSendAt: number | undefined;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("zone" in body) ||
    typeof body.zone !== "string" ||
    body.zone.length < 1 ||
    body.zone.length > 20 ||
    ("item" in body &&
      (typeof body.item !== "string" || body.item.length > 60))
  ) {
    return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  if (!FEATURES.buzz) {
    return Response.json({ ok: true, sent: false, skipped: "flag off" });
  }

  const now = Date.now();
  if (lastSendAt !== undefined && now - lastSendAt < 10000) {
    return Response.json({ ok: true, sent: false, skipped: "rate" });
  }
  // Reserve the window before awaiting so concurrent requests cannot both send.
  lastSendAt = now;

  const item = "item" in body ? (body.item as string) : undefined;
  return Response.json({ ok: true, ...(await buzz(body.zone, item)) });
}
