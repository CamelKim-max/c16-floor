# Floor coach

Store cameras read what each shopper's body is doing and whisper one line into the sales associate's earpiece: who is ready to buy, who needs a nudge, who needs a plan, and who should be left alone.

- Live: https://c16-floor.vercel.app/floor (webcam) · `/floor?mode=feed` (store footage) · `/floor?mode=replay` (offline replay, no server)
- Track: No App — the associate never looks at a screen. The page is for judges and managers.
- Built solo at c0mpiled-16 @ UC San Diego, 2026-10-24.

## How it works
1. Every 4 s the page grabs a camera frame (640 px JPEG) and posts it to `POST /api/read`.
2. A vision model (Anthropic Messages API, `claude-sonnet-5-5`) returns only observable signals per shopper: alone / with a companion / group, earbuds, phone in hand, items held, comparing two items, looking around, touching a product, the product in focus, one related product.
3. Fixed, readable rules (`lib/coach.ts`) turn the signals into one of four plays plus the reasons ("why" tags) and one spoken line.
4. The page speaks the line only when a shopper's play changes (browser speech = the associate's earpiece) and, on "Ready to buy", pushes a phone/watch buzz (ntfy).
5. Skeleton view draws a live pose skeleton in the browser (MediaPipe Pose Landmarker) and hides the camera image on screen.

## What is real vs simulated
Live: the camera frames, the vision model's signal reads, the rules, the spoken cue and the phone buzz. Skeleton view hides the camera image on screen; in this prototype the frame still goes to the vision model. Replay mode plays saved reads. No frame is stored.

## Privacy
- Observable behavior only. The model is told never to describe or infer identity, face, age, gender, race, clothing or looks.
- No face recognition, no identity, no tracking across visits. Frames are processed in memory and discarded; nothing is written to storage or logs.
- Production design: pose skeleton + object tags computed next to the camera, so frames never leave the store.

## How we used AI coding tools
- **Director:** one Claude Code session (Claude Opus) wrote the spec, a frozen TypeScript contract (`lib/contract.ts`), short task briefs and the golden end-to-end test, and owned every merge and deploy. It never wrote product features.
- **Executors:** Codex (`gpt-6.1-sol`) agents ran in parallel, each in its own git worktree and lane (rules + vision API, floor UI, watch buzz, skeleton view, redesign, feed mode). 10 build briefs in total, each ≤ 3 files.
- **Gate:** a Playwright golden test (6 steps: health, three rule cases, replay at 1440 and 390 px) ran on production after every deploy; a deploy counted only when it passed.
- **Review:** one read-only Codex review pass found 2 P0 issues (runaway vision calls, cut-off speech) and one fix brief closed them.
- **Research:** Claude sub-agents gathered the pitch evidence with a cited source for every number.
- **What was different:** decisions, contract and acceptance test came first; code came from agents working in parallel; the human made product calls and tested on the real device.

## Run locally
```bash
npm install
echo 'ANTHROPIC_API_KEY=...' > .env.local   # optional: NTFY_TOPIC, LLM_MODEL
npm run dev   # open http://localhost:3000/floor
```
