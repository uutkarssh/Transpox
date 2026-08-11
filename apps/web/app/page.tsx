"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Client } from "@gradio/client";

type Box = [number, number, number, number];
type Detection = {
  id: string;
  label: string;
  confidence: number;
  box: Box;
  kind: "object" | "pothole";
};
type Payload = {
  status?: string;
  detections?: Array<{
    class?: string;
    label?: string;
    confidence?: number;
    bbox_xyxy?: number[];
    box?: number[];
  }>;
};

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";
type ModelStatus = "idle" | "loading" | "ready" | "error";

const POTHOLE_SPACE = process.env.NEXT_PUBLIC_HF_SPACE || "Uutkarssh/transpox-api";
const OBJECT_SPACE = process.env.NEXT_PUBLIC_HF_OBJECTS_SPACE || "Uutkarssh/transpox-objects-api";
const POTHOLE_API = "/detect_potholes";
const OBJECT_API = "/detect_objects";
const CONFIDENCE = 0.35;
const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 360;

function parsePayload(value: unknown): Payload {
  if (typeof value === "string") {
    try { return JSON.parse(value) as Payload; } catch { return {}; }
  }
  return value && typeof value === "object" ? value as Payload : {};
}

function normalizeBox(value: number[] | undefined): Box | null {
  if (!value || value.length < 4) return null;
  const [x1, y1, x2, y2] = value.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return [
    Math.max(0, Math.min(1, x1 / FRAME_WIDTH)),
    Math.max(0, Math.min(1, y1 / FRAME_HEIGHT)),
    Math.max(0, Math.min(1, (x2 - x1) / FRAME_WIDTH)),
    Math.max(0, Math.min(1, (y2 - y1) / FRAME_HEIGHT))
  ];
}

function payloadDetections(value: unknown, kind: Detection["kind"], prefix: string): Detection[] {
  const payload = parsePayload(value);
  return (payload.detections ?? []).map((item, index) => {
    const box = normalizeBox(item.bbox_xyxy ?? item.box);
    if (!box) return null;
    const confidence = Number(item.confidence ?? 0);
    const rawLabel = String(item.label ?? item.class ?? (kind === "pothole" ? "pothole" : "object"));
    const label = kind === "pothole" ? "Pothole" : rawLabel.replace(/_/g, " ");
    return {
      id: `${prefix}-${index}-${box.join("-")}`,
      label,
      confidence,
      box,
      kind
    } satisfies Detection;
  }).filter((item): item is Detection => Boolean(item));
}

export default function Home() {
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [apiStatus, setApiStatus] = useState<ConnectionStatus>("idle");
  const [yoloStatus, setYoloStatus] = useState<ModelStatus>("idle");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const potholeClientRef = useRef<any>(null);
  const objectClientRef = useRef<any>(null);
  const frameTimerRef = useRef<number | null>(null);
  const inferenceRunningRef = useRef(false);
  const runningRef = useRef(false);
  const lastPositionRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const speedRef = useRef(0);

  const updateSpeed = useCallback((value: number) => {
    const safe = Number.isFinite(value) && value >= 0 ? Math.min(value, 250) : 0;
    speedRef.current = safe;
    setSpeed(safe);
  }, []);

  const startGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((position) => {
      const gpsSpeed = position.coords.speed;
      if (typeof gpsSpeed === "number" && Number.isFinite(gpsSpeed) && gpsSpeed >= 0) {
        updateSpeed(gpsSpeed * 3.6);
        lastPositionRef.current = { lat: position.coords.latitude, lng: position.coords.longitude, time: position.timestamp };
        return;
      }

      const previous = lastPositionRef.current;
      const current = { lat: position.coords.latitude, lng: position.coords.longitude, time: position.timestamp };
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
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
  }, [updateSpeed]);

  const connectClients = useCallback(async () => {
    setApiStatus("connecting");
    const [potholes, objects] = await Promise.all([
      potholeClientRef.current ? Promise.resolve(potholeClientRef.current) : Client.connect(POTHOLE_SPACE),
      objectClientRef.current ? Promise.resolve(objectClientRef.current) : Client.connect(OBJECT_SPACE)
    ]);
    potholeClientRef.current = potholes;
    objectClientRef.current = objects;
    setApiStatus("connected");
    return { potholes, objects };
  }, []);

  const captureAndDetect = useCallback(async () => {
    if (!runningRef.current || inferenceRunningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return;

    inferenceRunningRef.current = true;
    setYoloStatus("loading");
    try {
      canvas.width = FRAME_WIDTH;
      canvas.height = FRAME_HEIGHT;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
      if (!blob) return;

      const { potholes, objects } = await connectClients();

      const [potholeResult, objectResult] = await Promise.all([
        potholes.predict(POTHOLE_API, { image: blob, confidence: CONFIDENCE }),
        objects.predict(OBJECT_API, { image: blob, confidence: CONFIDENCE })
      ]);

      const potholeData = Array.isArray(potholeResult?.data) ? potholeResult.data : [];
      const objectData = Array.isArray(objectResult?.data) ? objectResult.data : [];
      const next = [
        ...payloadDetections(potholeData[1], "pothole", `p-${Date.now()}`),
        ...payloadDetections(objectData[1], "object", `o-${Date.now()}`)
      ];
      setDetections(next);
      setYoloStatus("ready");
    } catch (error) {
      console.warn("Transpox inference cycle failed", error);
      potholeClientRef.current = null;
      objectClientRef.current = null;
      setApiStatus("error");
      setYoloStatus("error");
    } finally {
      inferenceRunningRef.current = false;
      if (runningRef.current) frameTimerRef.current = window.setTimeout(() => void captureAndDetect(), 350);
    }
  }, [connectClients]);

  const stopCamera = useCallback(() => {
    if (frameTimerRef.current !== null) window.clearTimeout(frameTimerRef.current);
    frameTimerRef.current = null;
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    potholeClientRef.current = null;
    objectClientRef.current = null;
    inferenceRunningRef.current = false;
    setRunning(false);
    setDetections([]);
    setApiStatus("idle");
    setYoloStatus("idle");
    updateSpeed(0);
  }, [updateSpeed]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("Camera view unavailable");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      runningRef.current = true;
      setRunning(true);
      startGPS();
      void captureAndDetect();
    } catch (error) {
      console.warn("Unable to start camera", error);
      stopCamera();
    }
  }, [captureAndDetect, startGPS, stopCamera]);

  useEffect(() => {
    void start();
    return () => stopCamera();
  }, [start, stopCamera]);

  const potholeCount = detections.filter((item) => item.kind === "pothole").length;
  const apiLabel = apiStatus === "connecting" ? "CONNECTING" : apiStatus === "connected" ? "CONNECTED" : apiStatus === "error" ? "RECONNECTING" : "OFFLINE";
  const yoloLabel = yoloStatus === "loading" ? "LOADING" : yoloStatus === "ready" ? "READY" : yoloStatus === "error" ? "RETRYING" : "IDLE";

  return (
    <main className="transpox-screen" onClick={() => { if (!runningRef.current) void start(); }}>
      <video ref={videoRef} className="camera" muted playsInline autoPlay />
      <canvas ref={canvasRef} hidden />

      <div className="detection-layer" aria-live="polite">
        {detections.map((item) => (
          <div
            key={item.id}
            className={`detection-box ${item.kind === "pothole" ? "pothole" : "object"}`}
            style={{ left: `${item.box[0] * 100}%`, top: `${item.box[1] * 100}%`, width: `${item.box[2] * 100}%`, height: `${item.box[3] * 100}%` }}
          >
            <span>{item.label} {Math.round(item.confidence * 100)}%</span>
          </div>
        ))}
      </div>

      {!running && (
        <button className="wake" onClick={(event) => { event.stopPropagation(); void start(); }}>
          Tap to start camera
        </button>
      )}

      <div className="system-status" aria-label={`API ${apiLabel}, YOLO ${yoloLabel}`}>
        <span className={`status-item ${apiStatus}`}><b />API {apiLabel}</span>
        <span className="status-divider" />
        <span className={`status-item ${yoloStatus}`}><b />YOLO {yoloLabel}</span>
      </div>

      <div className="speed-bar" aria-label={`Current speed ${Math.round(speed)} kilometers per hour`}>
        <span>{Math.round(speed)}</span>
        <small>km/h</small>
        {potholeCount > 0 && <i aria-label={`${potholeCount} potholes detected`} />}
      </div>
    </main>
  );
}
