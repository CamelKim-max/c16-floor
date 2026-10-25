# HyperSell

Store cameras read what each shopper's body is doing and whisper one line into the sales associate's earpiece: who is ready to buy, who needs a nudge, who needs a plan, and who should be left alone.

- Live: https://c16-floor.vercel.app/floor (webcam) · `/floor?mode=feed` (store footage) · `/floor?mode=replay` (offline replay, no server)
- Track: No App — the associate never looks at a screen. The page is for judges and managers.
- Team TidyMind. Built solo at c0mpiled-16 @ UC San Diego, 2026-10-24.

## Why it matters (numbers in the demo video, with sources)
- **−79.7%** purchases when customers learned the seller was a bot (disclosed before the call, outbound phone sales). Luo et al., Marketing Science 2019 (field experiment, 6,200+ customers). **64%** of customers would prefer companies not use AI in customer service. Gartner 2024 (5,728 customers).
- Matching the selling tactic to the shopper's goal raised purchases. Kim & McFarland, Journal of the Academy of Marketing Science 2024. Adapting to each customer ↔ higher sales performance across 155 samples, 31,000+ salespeople. Franke & Park, Journal of Marketing Research 2006 (meta-analysis).
- **$750K+** sold by each of about half of Neiman Marcus's commissioned associates with 1+ year tenure, in one fiscal year. Neiman Marcus Group 10-K, FY2018.
- **1.7×**: top 10% of sellers vs the average seller, same job. Hunter, Schmidt & Judiesch, Journal of Applied Psychology 1990 (output SD = 38.5% of mean for non-insurance sales incl. department store clerks); top 10% under a normal model (calc).
- **+4.5%** revenue when 168 stores re-set staff hours (field result, not ours). Fisher, Gallino & Netessine, M&SOM 2021.
- **~$120K** more sales per Foot Locker store a year, **~$290M** across 2,410 stores (illustrative estimate): store sales $6.52B, Foot Locker 10-K FY2024 × 4.5%. Not a HyperSell result; a controlled store pilot measures it.

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
