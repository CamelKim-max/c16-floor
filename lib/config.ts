// lib/config.ts — flags, timeouts, demo copy. Director only. Client-safe: no secrets.

/** Feature flags. Side features ship behind a flag; the director flips them at integration. */
export const FEATURES = {
  /** /floor?mode=replay plays fixtures/replay.json client-side (demo fallback). */
  replay: true,
  /** Side: ntfy buzz to the associate's watch when a shopper turns "ready". */
  buzz: false,
} satisfies Record<string, boolean>;

/** Replay step interval on /floor?mode=replay. */
export const REPLAY_STEP_MS = 2500;

/** English demo copy (owner edits). */
export const COPY = {
  appName: "Floor coach",
  floorTitle: "Store floor",
  privacyLine: "Frames are analyzed and discarded. No faces, no identity, nothing stored.",
  earpieceLabel: "Earpiece",
} as const;
