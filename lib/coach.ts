import { RULES, type Play, type Signals } from "@/lib/contract";

export function normalizeSignals(x: unknown, dwellSec: number): Signals {
  const value = x !== null && typeof x === "object"
    ? x as Record<string, unknown>
    : {};
  const productName = (name: unknown): string | undefined =>
    typeof name === "string" ? name.trim().slice(0, 60).trim() || undefined : undefined;
  const item = productName(value.item);
  const upsell = productName(value.upsell);

  return {
    party: value.party === "pair" || value.party === "group" ? value.party : "alone",
    earbuds: value.earbuds === true,
    phoneInHand: value.phoneInHand === true,
    itemsInHand: typeof value.itemsInHand === "number" && Number.isFinite(value.itemsInHand)
      ? Math.min(5, Math.max(0, Math.trunc(value.itemsInHand))) : 0,
    comparing: value.comparing === true,
    lookingAround: value.lookingAround === true,
    touchingProduct: value.touchingProduct === true,
    facing: value.facing === "aisle" || value.facing === "exit" ? value.facing : "product",
    dwellSec: typeof dwellSec === "number" && Number.isFinite(dwellSec)
      ? Math.max(0, dwellSec) : 0,
    ...(item ? { item } : {}),
    ...(upsell ? { upsell } : {}),
  };
}

export function whyTags(s: Signals): string[] {
  const tags: string[] = [];
  if (s.earbuds) tags.push("earbuds in");
  if (s.phoneInHand) tags.push("phone in hand");
  if (s.itemsInHand > 0) {
    tags.push(`holding ${s.itemsInHand} item${s.itemsInHand === 1 ? "" : "s"}`);
  }
  if (s.comparing) tags.push("comparing");
  if (s.lookingAround) tags.push("looking around");
  if (s.party === "pair") tags.push("with a companion");
  if (s.party === "group") tags.push("with a group");
  if (s.dwellSec > 0) tags.push(`${s.dwellSec} s in zone`);
  if (s.touchingProduct) tags.push("touching product");
  return tags.slice(0, 4);
}

export function choosePlay(s: Signals): Play {
  const item = s.item ?? "this item";
  const why = whyTags(s);

  if (s.earbuds && !s.lookingAround) {
    return {
      segment: "leave",
      why: ["earbuds in"],
      cue: "Leave alone. Earbuds in, shopping on their own. Stay visible, don't approach.",
    };
  }
  if (s.itemsInHand >= 1 && (s.comparing || s.dwellSec >= RULES.readyDwellSec)) {
    return {
      segment: "ready",
      why,
      cue: `Ready to buy. Holding ${item}. Go now: offer their size or the fitting room.`
        + (s.upsell ? ` Then suggest ${s.upsell}.` : ""),
    };
  }
  if (s.party !== "alone") {
    const companion = s.party === "pair" ? "a companion" : "a group";
    return {
      segment: "plan",
      why,
      cue: `Needs a plan. Shopping with ${companion}. Talk to both and ask the companion what they think of ${item}.`,
    };
  }
  if (s.lookingAround) {
    return {
      segment: "plan",
      why,
      cue: `Needs a plan. Looking around for help. Open with a question about ${item}, not "Can I help you?"`,
    };
  }
  if (s.touchingProduct && s.dwellSec >= RULES.nudgeDwellSec) {
    return {
      segment: "nudge",
      why,
      cue: `One nudge away. Lingering on ${item}. Share one fact about it, then step back.`,
    };
  }
  return {
    segment: "leave",
    why,
    cue: "Leave alone. Just browsing. Check again in a minute.",
  };
}
