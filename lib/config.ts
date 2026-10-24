// lib/config.ts — flags, timeouts, demo copy. Director only. Client-safe: no secrets.

/** Feature flags. Side features ship behind a flag; the director flips them at integration. */
export const FEATURES = {
  /** /floor?mode=replay plays fixtures/replay.json client-side (demo fallback). */
  replay: true,
  /** Side: ntfy buzz to the associate's watch when a shopper turns "ready". */
  buzz: true,
} satisfies Record<string, boolean>;

/** /floor?mode=feed plays these clips (public/feed/) in order, looping, as the store camera. */
export const FEED_CLIPS: readonly string[] = ["/feed/1.mp4", "/feed/2.mp4", "/feed/3.mp4"];

/** Replay step interval on /floor?mode=replay. */
export const REPLAY_STEP_MS = 2500;

/** English demo copy (owner edits). */
export const COPY = {
  appName: "HyperSell",
  floorTitle: "Store floor",
  privacyLine: "Frames are analyzed and discarded. No face recognition, no identity, nothing stored.",
  feedLabel: "AI-generated store footage. No real shoppers.",
  earpieceLabel: "Earpiece",
} as const;
