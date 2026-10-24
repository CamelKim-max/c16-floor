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

const segmentStyle: Record<Segment, { card: string; label: string; dot: string; marker: string }> = {
  ready: { card: "border-lime-300/50 bg-lime-300/10", label: "text-lime-300", dot: "bg-lime-300", marker: "border-lime-300" },
  nudge: { card: "border-amber-300/50 bg-amber-300/10", label: "text-amber-300", dot: "bg-amber-300", marker: "border-amber-300" },
  plan: { card: "border-sky-300/50 bg-sky-300/10", label: "text-sky-300", dot: "bg-sky-300", marker: "border-sky-300" },
  leave: { card: "border-violet-300/50 bg-violet-300/10", label: "text-violet-300", dot: "bg-violet-300", marker: "border-violet-300" },
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
            <span className={`flex size-10 items-center justify-center rounded-lg border-2 bg-slate-950/90 font-mono text-xl font-bold text-white sm:size-12 sm:text-2xl ${style.marker}`}>{shopper.track}</span>
            <span
              className={`w-max rounded-md bg-slate-950/90 px-2 py-1 text-xs font-semibold whitespace-nowrap transition-transform duration-700 ease-out motion-reduce:transition-none sm:text-sm ${style.label}`}
              style={{ transform: `translateX(${(0.5 - x) * 100}%)` }}
            >{SEGMENT_LABEL[shopper.play.segment]}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShopperCard({ shopper }: { shopper: ShopperRead }) {
  const style = segmentStyle[shopper.play.segment];
  return (
    <article className={`min-w-0 rounded-2xl border p-5 sm:p-6 ${style.card}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/20 font-mono text-base font-semibold text-white">{shopper.track}</span>
        <span className={`size-2 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
        <h2 className={`text-2xl font-semibold tracking-tight sm:text-3xl ${style.label}`}>{SEGMENT_LABEL[shopper.play.segment]}</h2>
      </div>
      <p className="break-words text-2xl leading-snug font-medium text-white sm:text-3xl">{shopper.play.cue}</p>
      <ul className="mt-5 flex flex-wrap gap-2" aria-label={shopper.track}>
        {shopper.play.why.map((why, index) => (
          <li key={`${why}-${index}`} className="max-w-full rounded-full border border-white/15 bg-slate-950/30 px-3 py-1 text-sm break-words text-slate-200">{why}</li>
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
  const buttonStyle = "min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300";

  return (
    <main className="min-h-dvh w-full min-w-0 bg-slate-950 font-sans text-slate-50">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-8 sm:py-7">
        <header className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-800 pb-5">
          <div>
            <p className="text-sm font-medium text-slate-400">{COPY.appName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{COPY.floorTitle}</h1>
              {mode === "replay" && <span className="rounded-full border border-sky-300/40 bg-sky-300/10 px-3 py-1 text-xs font-semibold text-sky-200">Replay</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {mode === "replay" && <button type="button" className={buttonStyle} onClick={restartReplay}>Replay again</button>}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-600 px-4 py-2 text-sm font-medium">
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
                className="size-4 accent-lime-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300"
              />
              {COPY.earpieceLabel}
            </label>
            {mode === "live" && (
              <button type="button" aria-pressed={skeletonView} className={`${buttonStyle} ${skeletonView ? "border-lime-300 text-lime-300" : ""}`} onClick={() => setSkeletonView((value) => !value)}>Skeleton view</button>
            )}
            {speaking && (
              <span role="status" className="flex items-center gap-2 text-sm text-lime-300">
                <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-lime-300 motion-reduce:animate-none" />
                Speaking to earpiece
              </span>
            )}
          </div>
        </header>
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
          <section className="min-w-0 lg:sticky lg:top-7" aria-label={mode === "replay" ? "Replay" : COPY.floorTitle}>
            <div className={`relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 ${mode === "live" && cameraState === "running" ? "" : "aspect-video"}`}>
              {mode === "live" ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className={`${cameraState === "running" ? "block h-auto w-full" : "absolute inset-0 h-full w-full object-contain"} ${skeletonView ? "opacity-0" : ""}`} />
                  {skeletonView && <PoseLayer video={poseVideo} active />}
                  {cameraState !== "running" && (
                    <button type="button" disabled={cameraState === "starting"} onClick={() => void startCamera()} className="relative rounded-xl bg-lime-300 px-6 py-3 font-semibold text-slate-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300 disabled:cursor-wait disabled:opacity-60">Start camera</button>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap justify-center gap-4 p-6" aria-hidden="true">
                  {read?.shoppers.filter((shopper) => shopper.signals.x === undefined).map((shopper) => (
                    <div key={shopper.track} className={`flex size-20 items-center justify-center rounded-2xl border text-4xl font-semibold sm:size-24 ${segmentStyle[shopper.play.segment].card} ${segmentStyle[shopper.play.segment].label}`}>{shopper.track}</div>
                  ))}
                </div>
              )}
              <ShopperMarkers shoppers={read?.shoppers ?? []} />
            </div>
            <canvas ref={canvasRef} hidden />
            <div className="mt-3 flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              {read && readTime && (mode === "replay" ? (
                <time dateTime={readTime} className="font-mono tabular-nums">{read.ts / 1000} s · {read.ms} ms</time>
              ) : (
                <p className="font-mono tabular-nums">Read in {read.ms} ms · {read.shoppers.length} {read.shoppers.length === 1 ? "shopper" : "shoppers"}</p>
              ))}
              {readFailed && <p role="status" className="text-amber-300">Read failed, retrying</p>}
            </div>
          </section>
          <section className="grid min-w-0 gap-4" aria-live="polite" aria-atomic="true" aria-label={COPY.floorTitle}>
            {read?.shoppers.map((shopper) => <ShopperCard key={shopper.track} shopper={shopper} />)}
          </section>
        </div>
        <footer className="mt-8 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-400">{COPY.privacyLine}</footer>
      </div>
    </main>
  );
}

export default function FloorView({ mode }: { mode: Mode }) {
  return <FloorSession key={mode} mode={mode} />;
}
