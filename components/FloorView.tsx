"use client";

import { useEffect, useRef, useState } from "react";
import { PoseLayer } from "@/components/PoseLayer";
import replay from "@/fixtures/replay.json";
import { COPY, FEATURES, REPLAY_STEP_MS } from "@/lib/config";
import {
  READ, ROUTES, SEGMENT_LABEL,
  type Read, type ReadRequest, type ReadResponse, type Segment, type ShopperRead,
} from "@/lib/contract";

type Mode = "live" | "replay";
const replayReads = (replay as { reads: Read[] }).reads;

const segmentStyle: Record<Segment, { label: string; marker: string }> = {
  ready: { label: "text-point", marker: "border-point" },
  nudge: { label: "text-text-primary", marker: "border-text-primary" },
  plan: { label: "text-text-secondary", marker: "border-promo" },
  leave: { label: "text-text-secondary", marker: "border-text-secondary" },
};

function ShopperMarkers({ shoppers }: { shoppers: ShopperRead[] }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {shoppers.map((shopper) => {
        const x = shopper.signals.x;
        if (x === undefined || !Number.isFinite(x) || x < 0 || x > 1) return null;
        const style = segmentStyle[shopper.play.segment];
        return (
          <div
            key={shopper.track}
            className="absolute top-[35%] flex w-10 -translate-x-1/2 flex-col items-center gap-1 transition-[left,opacity] duration-700 ease-out motion-reduce:transition-none sm:w-12"
            style={{ left: `${x * 100}%` }}
          >
            <span className={`flex size-10 items-center justify-center rounded-[6px] border-2 bg-bg-base text-xl font-semibold tracking-normal text-text-primary tabular-nums sm:size-12 sm:text-2xl ${style.marker}`}>{shopper.track}</span>
            <span
              className={`w-max rounded-full border border-border-strong bg-bg-base px-2.5 py-[3px] text-xs font-medium whitespace-nowrap transition-transform duration-700 ease-out motion-reduce:transition-none ${style.label}`}
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

function FloorSession({ mode }: { mode: Mode }) {
  const [read, setRead] = useState<Read | null>(() => mode === "replay" ? (replayReads[0] ?? null) : null);
  const [earpiece, setEarpiece] = useState(true);
  const [skeletonView, setSkeletonView] = useState(false);
  const [poseVideo, setPoseVideo] = useState<HTMLVideoElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "running">("idle");
  const [readFailed, setReadFailed] = useState(false);
  const [replayRun, setReplayRun] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const firstShopperAt = useRef<number | null>(null);
  const previousSegments = useRef(new Map<string, Segment>());
  const activeCue = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      activeCue.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!read) return;
    const changes = read.shoppers.filter((shopper) => previousSegments.current.get(shopper.track) !== shopper.play.segment);
    previousSegments.current = new Map(read.shoppers.map((shopper) => [shopper.track, shopper.play.segment]));
    if (mode === "live" && FEATURES.buzz) {
      for (const shopper of changes) {
        if (shopper.play.segment !== "ready") continue;
        void fetch("/api/buzz", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ zone: "A", item: shopper.signals.item }),
        }).catch(() => {});
      }
    }
    const changed = changes[0];
    if (!earpiece || !changed || typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    const cue = new SpeechSynthesisUtterance(changed.play.cue);
    cue.rate = 1.05;
    cue.lang = "en-US";
    cue.onstart = () => {
      if (activeCue.current === cue) setSpeaking(true);
    };
    const finish = () => {
      if (activeCue.current !== cue) return;
      activeCue.current = null;
      setSpeaking(false);
    };
    cue.onend = finish;
    cue.onerror = finish;
    activeCue.current = cue;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(cue);
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
    if (mode !== "live" || cameraState !== "running") return;
    let active = true;
    let busy = false;
    let controller: AbortController | null = null;

    const capture = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (busy || !video || !canvas || !video.videoWidth || !video.videoHeight) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      busy = true;
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
        if (!active) return;
        if (result.read.shoppers.length === 0) firstShopperAt.current = null;
        else if (firstShopperAt.current === null) firstShopperAt.current = performance.now();
        setRead(result.read);
        setReadFailed(false);
      } catch {
        if (active) setReadFailed(true);
      } finally {
        context.clearRect(0, 0, canvas.width, canvas.height);
        window.clearTimeout(timeout);
        busy = false;
        controller = null;
      }
    };

    void capture();
    const timer = window.setInterval(() => void capture(), READ.everyMs);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [mode, cameraState]);

  async function startCamera() {
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mountedRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (!mountedRef.current) return;
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
                    setSpeaking(false);
                    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
                  }
                }}
                className="size-4 shrink-0 cursor-pointer appearance-none rounded-[6px] border border-border-input bg-bg-base checked:border-navy checked:bg-navy checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20d=%22m3%208%203%203%207-7%22%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%222%22/%3E%3C/svg%3E')] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-point"
              />
              {COPY.earpieceLabel}
            </label>
            {mode === "live" && (
              <button type="button" aria-pressed={skeletonView} className="control" onClick={() => setSkeletonView((value) => !value)}>Skeleton view</button>
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
            <div className={`relative flex items-center justify-center overflow-hidden rounded-[14px] border border-border-default ${skeletonView ? "bg-[#141414]" : "bg-bg-subtle"} ${mode === "live" && cameraState === "running" ? "" : "aspect-video"}`}>
              {mode === "live" ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted onPlaying={(event) => setPoseVideo(event.currentTarget)} onEmptied={() => setPoseVideo(null)} onEnded={() => setPoseVideo(null)} className={`${cameraState === "running" ? "block h-auto w-full" : "absolute inset-0 h-full w-full object-contain"} ${skeletonView ? "opacity-0" : ""}`} />
                  {skeletonView && <PoseLayer video={poseVideo} active />}
                  {cameraState !== "running" && (
                    <button type="button" disabled={cameraState === "starting"} onClick={() => void startCamera()} className="control control-primary relative">Start camera</button>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap justify-center gap-4 p-6" aria-hidden="true">
                  {read?.shoppers.filter((shopper) => shopper.signals.x === undefined).map((shopper) => (
                    <div key={shopper.track} className={`flex size-20 items-center justify-center rounded-[6px] border-2 bg-bg-base text-4xl font-semibold tracking-normal text-text-primary tabular-nums sm:size-24 ${segmentStyle[shopper.play.segment].marker}`}>{shopper.track}</div>
                  ))}
                </div>
              )}
              <ShopperMarkers shoppers={read?.shoppers ?? []} />
            </div>
            <canvas ref={canvasRef} hidden />
            <div className="mt-3 flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
              {read && readTime && (mode === "replay" ? (
                <time dateTime={readTime} className="tracking-normal tabular-nums">{read.ts / 1000} s · {read.ms} ms</time>
              ) : (
                <p className="tracking-normal tabular-nums">Read in {read.ms} ms · {read.shoppers.length} {read.shoppers.length === 1 ? "shopper" : "shoppers"}</p>
              ))}
              {readFailed && <p role="status" className="rounded-full bg-error-bg px-2.5 py-[3px] font-medium text-error">Read failed, retrying</p>}
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

export default function FloorView({ mode }: { mode: Mode }) {
  return <FloorSession key={mode} mode={mode} />;
}
