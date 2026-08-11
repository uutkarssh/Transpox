"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

type Box = [number, number, number, number];
type Detection = {
  id: string;
  label: string;
  confidence: number;
  box: Box;
  kind: "object" | "pothole";
};

type ApiStatus = "idle" | "connecting" | "detecting" | "error";
type ApiState = { status: ApiStatus; failCount: number; nextAttemptAt: number };

const POTHOLE_ENDPOINT = "/api/pothole";
const OBJECT_ENDPOINT = "/api/objects";
const CONFIDENCE = 0.35;
const MAX_CAPTURE_DIMENSION = 640;
const FRAME_INTERVAL_MS = 1200;
const REQUEST_TIMEOUT_MS = 55000;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 15000;

function backoffDelay(failCount: number) {
  if (failCount <= 0) return 0;
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failCount - 1));
}

function normalizeBox(value: number[] | undefined, frameW: number, frameH: number): Box | null {
  if (!value || value.length < 4) return null;
  const [x1, y1, x2, y2] = value.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite) || frameW <= 0 || frameH <= 0) return null;
  return [
    Math.max(0, Math.min(1, x1 / frameW)),
    Math.max(0, Math.min(1, y1 / frameH)),
    Math.max(0, Math.min(1, (x2 - x1) / frameW)),
    Math.max(0, Math.min(1, (y2 - y1) / frameH)),
  ];
}

function coverBoxToPercent(
  box: Box,
  frameW: number,
  frameH: number,
  containerW: number,
  containerH: number
) {
  if (!containerW || !containerH || !frameW || !frameH) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.max(containerW / frameW, containerH / frameH);
  const displayedW = frameW * scale;
  const displayedH = frameH * scale;
  const offsetX = (displayedW - containerW) / 2;
  const offsetY = (displayedH - containerH) / 2;
  const [x, y, w, h] = box;
  return {
    left: ((x * displayedW - offsetX) / containerW) * 100,
    top: ((y * displayedH - offsetY) / containerH) * 100,
    width: (w * displayedW / containerW) * 100,
    height: (h * displayedH / containerH) * 100,
  };
}

function parseDetections(payload: any, kind: Detection["kind"], frameW: number, frameH: number): Detection[] {
  const items = Array.isArray(payload?.detections) ? payload.detections : [];
  return items.map((item: any, index: number) => {
    const box = normalizeBox(item?.bbox_xyxy ?? item?.box, frameW, frameH);
    if (!box) return null;
    const confidence = Number(item?.confidence ?? 0);
    const rawLabel = String(item?.class ?? item?.label ?? (kind === "pothole" ? "pothole" : "object"));
    return {
      id: `${kind}-${Date.now()}-${index}-${box.join("-")}`,
      label: kind === "pothole" ? "Pothole" : rawLabel.replace(/_/g, " "),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      box,
      kind,
    } satisfies Detection;
  }).filter((item: Detection | null): item is Detection => Boolean(item));
}

async function callDetector(
  endpoint: string,
  kind: Detection["kind"],
  stateRef: MutableRefObject<ApiState>,
  setState: (state: ApiState) => void,
  blob: Blob,
  frameW: number,
  frameH: number
): Promise<Detection[] | null> {
  const now = Date.now();
  if (now < stateRef.current.nextAttemptAt) return null;

  const connectingState: ApiState = { ...stateRef.current, status: "connecting" };
  stateRef.current = connectingState;
  setState(connectingState);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append("image", blob, "transpox-frame.jpg");
    form.append("confidence", String(CONFIDENCE));

    const response = await fetch(endpoint, {
      method: "POST",
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.message) message = errorBody.message;
      } catch {
        // Keep the HTTP status as the useful error.
      }
      throw new Error(message);
    }

    const payload = await response.json();
    if (payload?.status !== "ok") {
      throw new Error(payload?.message || "Model returned an error");
    }

    const readyState: ApiState = { status: "detecting", failCount: 0, nextAttemptAt: 0 };
    stateRef.current = readyState;
    setState(readyState);
    return parseDetections(payload, kind, frameW, frameH);
  } catch (error) {
    const failCount = stateRef.current.failCount + 1;
    const failedState: ApiState = {
      status: "error",
      failCount,
      nextAttemptAt: Date.now() + backoffDelay(failCount),
    };
    stateRef.current = failedState;
    setState(failedState);
    console.warn(`[${kind}] detection request failed`, error);
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function Home() {
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [potholeDetections, setPotholeDetections] = useState<Detection[]>([]);
  const [objectDetections, setObjectDetections] = useState<Detection[]>([]);
  const [potholeApi, setPotholeApi] = useState<ApiState>({ status: "idle", failCount: 0, nextAttemptAt: 0 });
  const [objectApi, setObjectApi] = useState<ApiState>({ status: "idle", failCount: 0, nextAttemptAt: 0 });
  const [cameraError, setCameraError] = useState(false);
  const [frameDims, setFrameDims] = useState({ w: 640, h: 360 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const inferenceRunningRef = useRef(false);
  const potholeStateRef = useRef<ApiState>(potholeApi);
  const objectStateRef = useRef<ApiState>(objectApi);
  const gpsWatchRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  useEffect(() => {
    potholeStateRef.current = potholeApi;
  }, [potholeApi]);

  useEffect(() => {
    objectStateRef.current = objectApi;
  }, [objectApi]);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        w: window.innerWidth,
        h: window.visualViewport?.height ?? window.innerHeight,
      });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  const updateSpeed = useCallback((value: number) => {
    const safe = Number.isFinite(value) && value >= 0 ? Math.min(value, 250) : 0;
    setSpeed(safe);
  }, []);

  const startGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const gpsSpeed = position.coords.speed;
        if (typeof gpsSpeed === "number" && Number.isFinite(gpsSpeed) && gpsSpeed >= 0) {
          updateSpeed(gpsSpeed * 3.6);
          lastPositionRef.current = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            time: position.timestamp,
          };
          return;
        }

        const previous = lastPositionRef.current;
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          time: position.timestamp,
        };
        lastPositionRef.current = current;
        if (!previous) return;

        const lat1 = previous.lat * Math.PI / 180;
        const lat2 = current.lat * Math.PI / 180;
        const dLat = lat2 - lat1;
        const dLon = (current.lng - previous.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        const meters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const seconds = Math.max((current.time - previous.time) / 1000, 0.25);
        updateSpeed((meters / seconds) * 3.6);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }, [updateSpeed]);

  const captureAndDetect = useCallback(async () => {
    if (!runningRef.current || inferenceRunningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
      if (runningRef.current) timerRef.current = window.setTimeout(() => void captureAndDetect(), 500);
      return;
    }

    inferenceRunningRef.current = true;

    try {
      const videoW = video.videoWidth;
      const videoH = video.videoHeight;
      const scale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(videoW, videoH));
      const frameW = Math.max(2, Math.round(videoW * scale));
      const frameH = Math.max(2, Math.round(videoH * scale));

      canvas.width = frameW;
      canvas.height = frameH;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(video, 0, 0, frameW, frameH);
      setFrameDims({ w: frameW, h: frameH });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.72);
      });
      if (!blob) throw new Error("Could not capture camera frame");

      // Both calls are independent. A failure in one proxy never cancels the other.
      const [potholeResult, objectResult] = await Promise.all([
        callDetector(
          POTHOLE_ENDPOINT,
          "pothole",
          potholeStateRef,
          setPotholeApi,
          blob,
          frameW,
          frameH
        ),
        callDetector(
          OBJECT_ENDPOINT,
          "object",
          objectStateRef,
          setObjectApi,
          blob,
          frameW,
          frameH
        ),
      ]);

      if (potholeResult !== null) setPotholeDetections(potholeResult);
      if (objectResult !== null) setObjectDetections(objectResult);
    } catch (error) {
      console.warn("Transpox frame processing failed", error);
    } finally {
      inferenceRunningRef.current = false;
      if (runningRef.current) {
        timerRef.current = window.setTimeout(() => void captureAndDetect(), FRAME_INTERVAL_MS);
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    runningRef.current = false;
    inferenceRunningRef.current = false;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (gpsWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }

    setRunning(false);
    setPotholeDetections([]);
    setObjectDetections([]);
    setPotholeApi({ status: "idle", failCount: 0, nextAttemptAt: 0 });
    setObjectApi({ status: "idle", failCount: 0, nextAttemptAt: 0 });
    potholeStateRef.current = { status: "idle", failCount: 0, nextAttemptAt: 0 };
    objectStateRef.current = { status: "idle", failCount: 0, nextAttemptAt: 0 };
    lastPositionRef.current = null;
    updateSpeed(0);
  }, [updateSpeed]);

  useEffect(() => stopCamera, [stopCamera]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    setCameraError(false);

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Camera view unavailable");
      }

      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      runningRef.current = true;
      setRunning(true);
      startGPS();
      void captureAndDetect();
    } catch (error) {
      console.warn("Unable to start camera", error);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      runningRef.current = false;
      setRunning(false);
      setCameraError(true);
    }
  }, [captureAndDetect, startGPS]);

  const allDetections = [...potholeDetections, ...objectDetections];
  const potholeStatus = potholeApi.status === "connecting" ? "CONNECTING" : potholeApi.status === "detecting" ? "DETECTING" : potholeApi.status === "error" ? "RETRYING" : "OFFLINE";
  const objectStatus = objectApi.status === "connecting" ? "CONNECTING" : objectApi.status === "detecting" ? "DETECTING" : objectApi.status === "error" ? "RETRYING" : "OFFLINE";
  const potholeDot = potholeApi.status === "error" ? "error" : potholeApi.status === "detecting" ? "connected" : "connecting";
  const objectDot = objectApi.status === "error" ? "error" : objectApi.status === "detecting" ? "connected" : "connecting";

  return (
    <main className="transpox-screen">
      <video ref={videoRef} className="camera" muted playsInline autoPlay />
      <canvas ref={canvasRef} hidden />

      <div className="detection-layer" aria-live="polite">
        {allDetections.map((item) => {
          const position = coverBoxToPercent(
            item.box,
            frameDims.w,
            frameDims.h,
            viewport.w,
            viewport.h
          );

          return (
            <div
              key={item.id}
              className={`detection-box ${item.kind === "pothole" ? "pothole" : "object"}`}
              style={{
                left: `${position.left}%`,
                top: `${position.top}%`,
                width: `${position.width}%`,
                height: `${position.height}%`,
              }}
            >
              <span>{item.label} {Math.round(item.confidence * 100)}%</span>
            </div>
          );
        })}
      </div>

      {!running && (
        <button type="button" className="wake" onClick={() => void start()}>
          {cameraError ? "Allow camera & try again" : "Tap to start camera"}
        </button>
      )}

      <div className="system-status" aria-label={`Pothole API ${potholeStatus}, Object API ${objectStatus}`}>
        <span className={`status-item ${potholeDot}`}><b />POTHOLE {potholeStatus}</span>
        <span className="status-divider" />
        <span className={`status-item ${objectDot}`}><b />OBJECT {objectStatus}</span>
      </div>

      <div className="speed-bar" aria-label={`Current speed ${Math.round(speed)} kilometers per hour`}>
        <span>{Math.round(speed)}</span>
        <small>km/h</small>
        {potholeDetections.length > 0 && <i aria-label={`${potholeDetections.length} potholes detected`} />}
      </div>
    </main>
  );
}
