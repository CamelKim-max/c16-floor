"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

export function PoseLayer({ video, active }: { video: HTMLVideoElement | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const warnedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || !video) return;
    let cancelled = false;
    let loading = false;
    let frame = 0;
    let lastVideoTime = -1;
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
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate,
          },
          runningMode: "VIDEO",
          numPoses: 4,
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
                context.lineWidth = 2;
                context.strokeStyle = "rgba(255, 255, 255, 0.8)";
                context.fillStyle = "#bef264";
                for (const pose of result.landmarks) {
                  context.beginPath();
                  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
                    // Keep the nose, but omit facial detail from both lines and dots.
                    if ((start >= 1 && start <= 10) || (end >= 1 && end <= 10)) continue;
                    const from = pose[start];
                    const to = pose[end];
                    if (!from || !to || from.visibility < 0.5 || to.visibility < 0.5) continue;
                    context.moveTo(from.x * canvas.width, from.y * canvas.height);
                    context.lineTo(to.x * canvas.width, to.y * canvas.height);
                  }
                  context.stroke();
                  pose.forEach((landmark, index) => {
                    if ((index >= 1 && index <= 10) || landmark.visibility < 0.5) return;
                    context.beginPath();
                    context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 3, 0, Math.PI * 2);
                    context.fill();
                  });
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
  }, [video, active]);

  if (!active || failed) return null;
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
