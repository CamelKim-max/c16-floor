// lib/contract.ts — SPEC §4 product contract. Director only; executors send CONTRACT-REQUEST.
// ===== SPEC §4 — product contract (pasted at LOCK; executors never edit) =====
export type Party = "alone" | "pair" | "group";
export type Facing = "product" | "aisle" | "exit";

/** Observable signals only. Never identity, face, age, gender, race, clothing or looks. */
export type Signals = {
  party: Party;
  earbuds: boolean;
  phoneInHand: boolean;
  itemsInHand: number;      // products held, 0..5
  comparing: boolean;       // holding or alternating between 2+ similar items
  lookingAround: boolean;   // head up, scanning the floor
  touchingProduct: boolean;
  facing: Facing;
  dwellSec: number;         // seconds a shopper has been in this zone (client counts; server copies ReadRequest.dwellSec when vision is used)
  item?: string;            // product in focus, short noun phrase, e.g. "grey running shoes" — the product, never the person
  upsell?: string;          // one related product to suggest, e.g. "running socks"
  x?: number;               // 0..1 horizontal center of the shopper in the frame (overlay marker only)
};

export type Segment = "ready" | "nudge" | "plan" | "leave";
export const SEGMENTS: readonly Segment[] = ["ready", "nudge", "plan", "leave"];
export const SEGMENT_LABEL: Readonly<Record<Segment, string>> = {
  ready: "Ready to buy", nudge: "One nudge away", plan: "Needs a plan", leave: "Leave alone",
};

export type Play = { segment: Segment; why: string[]; cue: string };
export type ShopperRead = { track: string; signals: Signals; play: Play };   // track = "A","B",… left to right
export type ReadMode = "live" | "signals" | "replay";
export type Read = { id: string; ts: number; zone: string; mode: ReadMode; ms: number; shoppers: ShopperRead[] };

/** POST /api/read. Exactly one of image | signals. image = "data:image/jpeg;base64,…" (≤ READ.maxImageBytes chars). */
export type ReadRequest = { zone: string; image?: string; signals?: Signals[]; dwellSec?: number };
export type ReadResponse = { ok: true; read: Read } | { ok: false; error: string };

export const ROUTES = { read: "/api/read", health: "/api/health", floor: "/floor" } as const;
export const READ = {
  everyMs: 4000,            // /floor capture interval
  imageWidth: 640,          // client downscale before upload
  maxImageBytes: 600000,    // data URL length cap → 413
  modelTimeoutMs: 12000,    // one vision call; on fail → { ok:false } and /floor keeps the last read
  maxShoppers: 4,
} as const;

/** Thresholds used by choosePlay (lib/coach.ts). */
export const RULES = { readyDwellSec: 45, nudgeDwellSec: 15 } as const;
