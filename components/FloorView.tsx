"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PoseLayer } from "@/components/PoseLayer";
import replay from "@/fixtures/replay.json";
import { COPY, FEATURES, FEED_CLIPS, REPLAY_STEP_MS } from "@/lib/config";
import {
  READ, ROUTES, SEGMENT_LABEL,
  type Read, type ReadRequest, type ReadResponse, type Segment, type ShopperRead,
} from "@/lib/contract";

type Mode = "live" | "replay" | "feed";
const replayReads = (replay as { reads: Read[] }).reads;

const segmentStyle: Record<Segment, { label: string; marker: string }> = {
  ready: { label: "text-point", marker: "border-point" },
  nudge: { label: "text-text-primary", marker: "border-text-primary" },
  plan: { label: "text-text-secondary", marker: "border-promo" },
  leave: { label: "text-text-secondary", marker: "border-text-secondary" },
};

// Snap model-estimated x to the nearest detected body, each body used once.
function snapToPoses(shoppers: ShopperRead[], poses: number[]) {
  const free = [...poses];
  return new Map(shoppers.map((shopper) => {
    const x = shopper.signals.x;
    if (x === undefined || !Number.isFinite(x) || free.length === 0) return [shopper.track, x];
    let best = 0;
    free.forEach((pose, index) => { if (Math.abs(pose - x) < Math.abs(free[best] - x)) best = index; });
    if (Math.abs(free[best] - x) > 0.25) return [shopper.track, x];
    return [shopper.track, free.splice(best, 1)[0]];
  }));
}

function ShopperMarkers({ shoppers, poses }: { shoppers: ShopperRead[]; poses: number[] }) {
  const snapped = snapToPoses(shoppers, poses);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {shoppers.map((shopper) => {
        const x = snapped.get(shopper.track);
        if (x === undefined || !Number.isFinite(x) || x < 0 || x > 1) return null;
        const style = segmentStyle[shopper.play.segment];
        return (
          <div
            key={shopper.track}
            className="absolute top-[4%] flex w-7 -translate-x-1/2 flex-col items-center gap-0.5 opacity-90 transition-[left,opacity] duration-700 ease-out motion-reduce:transition-none sm:w-8"
            style={{ left: `${x * 100}%` }}
          >
            <span className={`flex size-7 items-center justify-center rounded-[6px] border-2 bg-bg-base text-sm font-semibold tracking-normal text-text-primary tabular-nums sm:size-8 sm:text-base ${style.marker}`}>{shopper.track}</span>
            <span
              className={`w-max rounded-full border border-border-strong bg-bg-base px-2 py-px text-[11px] leading-4 font-medium whitespace-nowrap transition-transform duration-700 ease-out motion-reduce:transition-none ${style.label}`}
              style={{ transform: `translateX(${(0.5 - x) * 100}%)` }}
            >{SEGMENT_LABEL[shopper.play.segment]}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShopperCard({ shopper, inverse, promo }: { shopper: ShopperRead; inverse: boolean; promo: boolean }) {
  const style = segmentStyle[shopper.play.segment];
  return (
    <article className={`min-w-0 rounded-[10px] border border-border-default p-4 sm:p-6 ${inverse ? "bg-bg-inverse text-text-inverse" : "bg-bg-base text-text-primary"}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-[6px] border text-base font-semibold tracking-normal tabular-nums ${inverse ? "border-white/20 text-text-inverse" : "border-border-strong text-text-primary"}`}>{shopper.track}</span>
        <span className={`size-2 shrink-0 rounded-full ${inverse ? "bg-bg-base" : "bg-bg-inverse"}`} aria-hidden="true" />
        <h2 className={`min-w-0 text-xl font-semibold sm:text-2xl sm:font-medium ${inverse ? "text-text-inverse" : promo ? "text-promo" : style.label}`}>{SEGMENT_LABEL[shopper.play.segment]}</h2>
      </div>
      <p className="text-xl font-medium break-words sm:text-2xl sm:font-normal">{shopper.play.cue}</p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={shopper.track}>
        {shopper.play.why.map((why, index) => (
          <li key={`${why}-${index}`} className={`max-w-full rounded-full px-2.5 py-[3px] text-xs font-medium break-words tracking-normal tabular-nums ${inverse ? "bg-white/[0.12] text-text-inverse" : "bg-bg-subtle text-text-secondary"}`}>{why}</li>
        ))}
      </ul>
    </article>
  );
}

function FloorSession({ mode, clip }: { mode: Mode; clip?: number }) {
  const feedClips = clip === undefined ? FEED_CLIPS : [FEED_CLIPS[clip - 1]];
  const [read, setRead] = useState<Read | null>(() => mode === "replay" ? (replayReads[0] ?? null) : null);
  const [earpiece, setEarpiece] = useState(true);
  const [skeleton, setSkeleton] = useState(false);
  const [hideVideo, setHideVideo] = useState(false);
  const [poseVideo, setPoseVideo] = useState<HTMLVideoElement | null>(null);
  const [poses, setPoses] = useState<number[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "running">("idle");
  const [readFailed, setReadFailed] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [feedMissing, setFeedMissing] = useState(false);
  const [replayRun, setReplayRun] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const firstShopperAt = useRef<number | null>(null);
  const previousShopperCount = useRef(0);
  const previousSegments = useRef(new Map<string, Segment>());
  const activeCue = useRef<SpeechSynthesisUtterance | null>(null);
  const speechQueue = useRef<string[]>([]);
  const captureCleanup = useRef<(() => void) | null>(null);
  const feedActive = useRef(false);
  const feedIndex = useRef(0);
  const failedFeedClips = useRef(new Set<number>());
  const scene = useRef(0);

  const stopCamera = useCallback((paused = false) => {
    captureCleanup.current?.();
    feedActive.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      if (mode === "feed") {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
    }
    firstShopperAt.current = null;
    previousShopperCount.current = 0;
    previousSegments.current.clear();
    setPoseVideo(null);
    setPoses([]);
    setSkeleton(false);
    setHideVideo(false);
    setCameraState("idle");
    setRead(null);
    setReadFailed(false);
    setSessionPaused(paused);
  }, [mode]);

  const handlePoseFail = useCallback(() => {
    setSkeleton(false);
    setHideVideo(false);
    setPoses([]);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      captureCleanup.current?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      activeCue.current = null;
      speechQueue.current = [];
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!read) return;
    const changes = read.shoppers.filter((shopper) => previousSegments.current.get(shopper.track) !== shopper.play.segment);
    previousSegments.current = new Map(read.shoppers.map((shopper) => [shopper.track, shopper.play.segment]));
    if (mode !== "replay" && FEATURES.buzz) {
      for (const shopper of changes) {
        if (shopper.play.segment !== "ready") continue;
        void fetch("/api/buzz", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ zone: "A", item: shopper.signals.item }),
        }).catch(() => {});
      }
    }
    if (!earpiece || typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    for (const shopper of changes) {
      speechQueue.current.push(shopper.play.cue);
      if (speechQueue.current.length > 3) speechQueue.current.shift();
    }
    const speakNext = () => {
      if (!mountedRef.current || activeCue.current) return;
      const text = speechQueue.current.shift();
      if (text === undefined) return;
      const cue = new SpeechSynthesisUtterance(text);
      cue.rate = 1.05;
      cue.lang = "en-US";
      cue.onstart = () => {
        if (activeCue.current === cue) setSpeaking(true);
      };
      const finish = () => {
        if (activeCue.current !== cue) return;
        activeCue.current = null;
        setSpeaking(false);
        speakNext();
      };
      cue.onend = finish;
      cue.onerror = finish;
      activeCue.current = cue;
      window.speechSynthesis.speak(cue);
    };
    speakNext();
  }, [read, earpiece, mode]);

  useEffect(() => {
    if (mode !== "replay" || replayReads.length === 0) return;
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % replayReads.length;
      setRead(replayReads[index]);
    }, REPLAY_STEP_MS);
    return () => window.clearInterval(timer);
  }, [mode, replayRun]);

  useEffect(() => {
    if (mode === "replay" || cameraState !== "running") return;
    let active = true;
    let busy = false;
    let reads = 0;
    let controller: AbortController | null = null;

    const capture = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!active || busy || document.visibilityState !== "visible" || reads >= 150 || !video || !canvas || !video.videoWidth || !video.videoHeight) return;
      if (mode === "feed" && (!feedActive.current || video.paused || video.ended || video.readyState < 2)) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      busy = true;
      const capturedScene = scene.current;
      let timeout: number | undefined;
      try {
        canvas.width = READ.imageWidth;
        canvas.height = Math.max(1, Math.round(video.videoHeight * READ.imageWidth / video.videoWidth));
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL("image/jpeg", 0.7);
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (image.length > READ.maxImageBytes) throw new Error("Frame too large");
        const dwellSec = firstShopperAt.current === null ? 0 : Math.max(0, Math.floor((performance.now() - firstShopperAt.current) / 1000));
        const body: ReadRequest = { zone: "A", image, dwellSec };
        controller = new AbortController();
        timeout = window.setTimeout(() => controller?.abort(), READ.modelTimeoutMs + READ.everyMs);
        reads += 1;
        const response = await fetch(ROUTES.read, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Read failed");
        const result = await response.json() as ReadResponse;
        if (!result.ok) throw new Error("Read failed");
        if (!active || capturedScene !== scene.current) return;
        const shopperCount = result.read.shoppers.length;
        if (shopperCount === 0) firstShopperAt.current = null;
        else if (firstShopperAt.current === null || shopperCount !== previousShopperCount.current) firstShopperAt.current = performance.now();
        previousShopperCount.current = shopperCount;
        setRead(result.read);
        setReadFailed(false);
      } catch {
        if (active && capturedScene === scene.current) setReadFailed(true);
      } finally {
        context.clearRect(0, 0, canvas.width, canvas.height);
        window.clearTimeout(timeout);
        busy = false;
        controller = null;
        if (active && reads >= 150) stopCamera(true);
      }
    };

    const timer = window.setInterval(() => void capture(), READ.everyMs);
    const cleanup = () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
      if (captureCleanup.current === cleanup) captureCleanup.current = null;
    };
    captureCleanup.current = cleanup;
    void capture();
    return cleanup;
  }, [mode, cameraState, stopCamera]);

  function playFeedClip(index: number, resetScene = true) {
    const video = videoRef.current;
    if (!video || !feedActive.current) return;
    feedIndex.current = index;
    if (resetScene) {
      scene.current += 1;
      firstShopperAt.current = null;
      previousShopperCount.current = 0;
      previousSegments.current.clear();
    }
    setRead(null);
    setReadFailed(false);
    setPoseVideo(null);
    setPoses([]);
    video.src = feedClips[index];
    video.load();
  }

  function advanceFeed(failed = false) {
    if (!feedActive.current) return;
    if (failed) failedFeedClips.current.add(feedIndex.current);
    if (failedFeedClips.current.size >= feedClips.length) {
      stopCamera();
      setFeedMissing(true);
      return;
    }
    let next = (feedIndex.current + 1) % feedClips.length;
    while (failedFeedClips.current.has(next)) next = (next + 1) % feedClips.length;
    playFeedClip(next, next !== feedIndex.current);
  }

  async function startCamera() {
    if (mode === "feed") {
      if (feedActive.current) return;
      setFeedMissing(false);
      setSessionPaused(false);
      failedFeedClips.current.clear();
      if (feedClips.length === 0) {
        setFeedMissing(true);
        return;
      }
      feedActive.current = true;
      setCameraState("starting");
      playFeedClip(0);
      return;
    }
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;
    setSessionPaused(false);
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mountedRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getTracks().forEach((track) => track.addEventListener("ended", () => {
        if (streamRef.current === stream) stopCamera();
      }, { once: true }));
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (!mountedRef.current || streamRef.current !== stream) return;
      setPoseVideo(videoRef.current);
      setReadFailed(false);
      setCameraState("running");
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (mountedRef.current) {
        setPoseVideo(null);
        setCameraState("idle");
        setReadFailed(true);
      }
    } finally {
      startingRef.current = false;
    }
  }

  function restartReplay() {
    previousSegments.current.clear();
    setRead(replayReads[0] ?? null);
    setReplayRun((run) => run + 1);
  }

  const readTime = read ? new Date(read.ts).toISOString() : null;
  const firstReadyIndex = read?.shoppers.findIndex((shopper) => shopper.play.segment === "ready") ?? -1;
  const firstPlanIndex = read?.shoppers.findIndex((shopper) => shopper.play.segment === "plan") ?? -1;

  return (
    <main className="min-h-dvh w-full min-w-0 bg-bg-base font-sans text-text-primary">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-4 sm:px-6 sm:py-6">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-bg-base pb-4 shadow-[inset_0_-1px_0_#EFEFEF] sm:pb-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-point uppercase">{COPY.appName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold sm:text-4xl sm:font-semibold">{COPY.floorTitle}</h1>
              {mode === "replay" && <span className="rounded-full bg-bg-subtle px-2.5 py-[3px] text-xs font-medium text-text-secondary">Replay</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {mode === "replay" && <button type="button" className="control control-primary" onClick={restartReplay}>Replay again</button>}
            <label className="control">
              <input
                type="checkbox"
                role="switch"
                checked={earpiece}
                onChange={(event) => {
                  setEarpiece(event.target.checked);
                  if (!event.target.checked) {
                    activeCue.current = null;
                    speechQueue.current = [];
                    setSpeaking(false);
                    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
                  }
                }}
                className="size-4 shrink-0 cursor-pointer appearance-none rounded-[6px] border border-border-input bg-bg-base checked:border-navy checked:bg-navy checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20d=%22m3%208%203%203%207-7%22%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%222%22/%3E%3C/svg%3E')] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-point"
              />
              {COPY.earpieceLabel}
            </label>
            {mode !== "replay" && (
              <>
                <button type="button" aria-pressed={skeleton} className="control" onClick={() => {
                  if (skeleton) { setHideVideo(false); setPoses([]); }
                  setSkeleton(!skeleton);
                }}>Skeleton</button>
                <button type="button" aria-pressed={hideVideo} disabled={!skeleton} className="control disabled:cursor-not-allowed" onClick={() => setHideVideo((value) => !value)}>Hide video</button>
              </>
            )}
            {mode !== "replay" && (cameraState === "running" || (mode === "feed" && cameraState === "starting")) && (
              <button type="button" className="control" onClick={() => stopCamera()}>{mode === "feed" ? "Stop" : "Stop camera"}</button>
            )}
            {speaking && (
              <span role="status" className="flex items-center gap-2 text-sm text-text-secondary">
                <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-bg-inverse motion-reduce:animate-none" />
                Speaking to earpiece
              </span>
            )}
          </div>
        </header>
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
          <section className="min-w-0 lg:sticky lg:top-6" aria-label={mode === "replay" ? "Replay" : COPY.floorTitle}>
            <div className={`relative flex items-center justify-center overflow-hidden rounded-[14px] border border-border-default ${hideVideo ? "bg-[#141414]" : "bg-bg-subtle"} ${mode !== "replay" && cameraState === "running" ? "" : "aspect-video"}`}>
              {mode !== "replay" ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted onPlaying={(event) => {
                    if (mode === "feed") {
                      if (!feedActive.current) return;
                      setCameraState("running");
                    }
                    setPoseVideo(event.currentTarget);
                  }} onEmptied={() => setPoseVideo(null)} onEnded={() => {
                    setPoseVideo(null);
                    if (mode === "feed") advanceFeed();
                  }} onError={() => {
                    if (mode === "feed") advanceFeed(true);
                  }} className={`${cameraState === "running" ? "block h-auto w-full" : "absolute inset-0 h-full w-full object-contain"} ${hideVideo ? "opacity-0" : ""}`} />
                  {skeleton && <PoseLayer video={poseVideo} active onFail={handlePoseFail} onPoses={setPoses} />}
                  {cameraState !== "running" && (
                    <button type="button" disabled={cameraState === "starting"} onClick={() => void startCamera()} className="control control-primary relative">{mode === "feed" ? "Start feed" : "Start camera"}</button>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap justify-center gap-4 p-6" aria-hidden="true">
                  {read?.shoppers.filter((shopper) => shopper.signals.x === undefined).map((shopper) => (
                    <div key={shopper.track} className={`flex size-20 items-center justify-center rounded-[6px] border-2 bg-bg-base text-4xl font-semibold tracking-normal text-text-primary tabular-nums sm:size-24 ${segmentStyle[shopper.play.segment].marker}`}>{shopper.track}</div>
                  ))}
                </div>
              )}
              <ShopperMarkers shoppers={read?.shoppers ?? []} poses={skeleton ? poses : []} />
              {mode === "feed" && <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-[6px] bg-[rgba(20,20,20,0.7)] px-2 py-1 text-xs font-medium text-white">{COPY.feedLabel}</span>}
            </div>
            <canvas ref={canvasRef} hidden />
            <div className="mt-3 flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
              {read && readTime && (mode === "replay" ? (
                <time dateTime={readTime} className="tracking-normal tabular-nums">{read.ts / 1000} s · {read.ms} ms</time>
              ) : (
                <p className="tracking-normal tabular-nums">Read in {read.ms} ms · {read.shoppers.length} {read.shoppers.length === 1 ? "shopper" : "shoppers"}</p>
              ))}
              {readFailed && <p role="status" className="rounded-full bg-error-bg px-2.5 py-[3px] font-medium text-error">Read failed, retrying</p>}
              {feedMissing && <p role="status">No feed clips found.</p>}
              {sessionPaused && <p role="status">Paused after 10 minutes. Start again to continue.</p>}
            </div>
          </section>
          <section className="grid min-w-0 gap-4" aria-live="polite" aria-atomic="true" aria-label={COPY.floorTitle}>
            {read?.shoppers.map((shopper, index) => <ShopperCard key={shopper.track} shopper={shopper} inverse={index === firstReadyIndex} promo={index === firstPlanIndex} />)}
          </section>
        </div>
        <footer className="mt-8 border-t border-border-default pt-4 text-caption text-text-muted">{COPY.privacyLine}</footer>
      </div>
    </main>
  );
}

export default function FloorView({ mode, clip }: { mode: Mode; clip?: number }) {
  return <FloorSession key={`${mode}:${clip ?? ""}`} mode={mode} clip={clip} />;
}
