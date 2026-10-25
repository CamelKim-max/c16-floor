"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

export function PoseLayer({ video, active, onFail, onPoses }: { video: HTMLVideoElement | null; active: boolean; onFail?: () => void; onPoses?: (centers: number[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const warnedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || !video) return;
    let cancelled = false;
    let loading = false;
    let frame = 0;
    let lastVideoTime = -1;
    let lastReport = 0;
    let landmarker: PoseLandmarker | null = null;

    const close = () => {
      const current = landmarker;
      landmarker = null;
      current?.close();
    };

    const fail = (error: unknown) => {
      if (cancelled) return;
      if (!warnedRef.current) {
        warnedRef.current = true;
        console.warn("Skeleton view", error);
      }
      setFailed(true);
      cancelAnimationFrame(frame);
      close();
      onFail?.();
    };

    const start = async () => {
      if (cancelled || loading || landmarker || video.paused || video.ended || video.readyState < 2) return;
      loading = true;
      try {
        const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        setFailed(false);
        const fileset = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm");
        if (cancelled) return;
        const create = (delegate: "GPU" | "CPU") => PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
            delegate,
          },
          runningMode: "VIDEO",
          numPoses: 4,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
        let created: PoseLandmarker;
        try {
          created = await create("GPU");
        } catch {
          if (cancelled) return;
          created = await create("CPU");
        }
        if (cancelled) {
          created.close();
          return;
        }
        landmarker = created;

        const draw = () => {
          if (cancelled || !landmarker) return;
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (canvas && context && !video.paused && !video.ended && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
            if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
            context.clearRect(0, 0, canvas.width, canvas.height);
            try {
              const result = landmarker.detectForVideo(video, performance.now());
              try {
                const scale = canvas.width / 480;
                context.lineWidth = 2.5 * scale;
                context.lineCap = "round";
                context.strokeStyle = "#bef264";
                context.fillStyle = "#ffffff";
                context.shadowColor = "rgba(0, 0, 0, 0.6)";
                context.shadowBlur = 2 * scale;
                for (const pose of result.landmarks) {
                  const visibilityNotPopulated = Math.max(0, ...pose.map((landmark) => landmark.visibility ?? 0)) === 0;
                  context.beginPath();
                  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
                    // Keep the nose, but omit facial detail from both lines and dots.
                    if ((start >= 1 && start <= 10) || (end >= 1 && end <= 10)) continue;
                    const from = pose[start];
                    const to = pose[end];
                    if (!from || !to || (!visibilityNotPopulated && ((from.visibility ?? 1) < 0.5 || (to.visibility ?? 1) < 0.5))) continue;
                    context.moveTo(from.x * canvas.width, from.y * canvas.height);
                    context.lineTo(to.x * canvas.width, to.y * canvas.height);
                  }
                  context.stroke();
                  pose.forEach((landmark, index) => {
                    if ((index >= 1 && index <= 10) || (!visibilityNotPopulated && (landmark.visibility ?? 1) < 0.5)) return;
                    context.beginPath();
                    context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 2.5 * scale, 0, Math.PI * 2);
                    context.fill();
                  });
                }
                const now = performance.now();
                if (onPoses && now - lastReport > 500) {
                  lastReport = now;
                  // Hip midpoint (23/24) is the steadiest horizontal center of a body.
                  onPoses(result.landmarks.map((pose) => ((pose[23]?.x ?? pose[0].x) + (pose[24]?.x ?? pose[0].x)) / 2));
                }
              } finally {
                result.close();
              }
            } catch (error) {
              fail(error);
              return;
            }
          }
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
      } catch (error) {
        fail(error);
      }
    };

    const onPlaying = () => void start();
    video.addEventListener("playing", onPlaying);
    void start();
    const canvas = canvasRef.current;
    return () => {
      cancelled = true;
      video.removeEventListener("playing", onPlaying);
      cancelAnimationFrame(frame);
      close();
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [video, active, onFail, onPoses]);

  if (!active || failed) return null;
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
