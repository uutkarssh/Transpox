"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Client } from "@gradio/client";

const RideMap = dynamic(() => import("./MapView"), { ssr: false });
const HF_SPACE = process.env.NEXT_PUBLIC_HF_SPACE || "Uutkarssh/transpox-api";
const HF_API = "/detect_potholes";

type Point = { lat: number; lng: number; timestamp: number; accuracy?: number; speed?: number; heading?: number };
type Detection = { id: string; lat: number; lng: number; confidence: number; source: string; timestamp: number; box?: [number, number, number, number]; className?: string };
type DetectionPayload = { status?: string; pothole_count?: number; count?: number; detections?: Array<{ class?: string; confidence?: number; bbox_xyxy?: number[]; box?: number[] }> };

function distanceMeters(a: Point, b: Point) {
  const R = 6371000, p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180, dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function dedupe(items: Detection[]) {
  const out: Detection[] = [];
  for (const item of items) if (!out.some((x) => distanceMeters(x, item) < 12)) out.push(item);
  return out;
}

function formatDuration(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function parsePayload(value: unknown): DetectionPayload {
  if (typeof value === "string") {
    try { return JSON.parse(value) as DetectionPayload; } catch { return {}; }
  }
  return value && typeof value === "object" ? value as DetectionPayload : {};
}

function getFileUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const item = value as { url?: string };
  return item.url ?? null;
}

export default function Home() {
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [potholes, setPotholes] = useState<Detection[]>([]);
  const [vehicles] = useState<Detection[]>([]);
  const [status, setStatus] = useState("Ready to scan the road");
  const [motion, setMotion] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastConfidence, setLastConfidence] = useState(0);
  const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);

  const watchId = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clientRef = useRef<any>(null);
  const connectingRef = useRef<Promise<any> | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const startTimeRef = useRef(0);
  const latestPointRef = useRef<Point | null>(null);
  const confidence = 0.35;

  useEffect(() => () => stopRide(), []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => { void captureFrame(); }, 500);
    return () => window.clearInterval(id);
  }, [running]);

  async function connectHF(): Promise<any> {
    if (clientRef.current) return clientRef.current;
    if (connectingRef.current) return connectingRef.current;
    setApiOnline(null);
    setStatus("Connecting Transpox AI…");

    connectingRef.current = (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const client = await Client.connect(HF_SPACE);
          clientRef.current = client;
          setApiOnline(true);
          setStatus("Transpox AI online — scanning road");
          return client;
        } catch (error) {
          lastError = error;
          console.warn(`HF connection attempt ${attempt}/3 failed`, error);
          if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, attempt * 2000));
        }
      }
      throw lastError ?? new Error("Hugging Face connection failed");
    })().finally(() => { connectingRef.current = null; });

    return connectingRef.current;
  }

  function reconnectLater() {
    if (!running || reconnectTimerRef.current !== null) return;
    setApiOnline(false);
    setStatus("AI connection lost — reconnecting…");
    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null;
      clientRef.current = null;
      try { await connectHF(); } catch { reconnectLater(); }
    }, 5000);
  }

  function onMotion(event: DeviceMotionEvent) {
    const a = event.accelerationIncludingGravity;
    if (!a) return;
    setMotion(Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2));
  }

  async function startMotion() {
    try {
      const request = (DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }).requestPermission;
      if (request && await request() !== "granted") return;
    } catch { /* optional sensor */ }
    window.addEventListener("devicemotion", onMotion);
  }

  async function startCamera() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraReady(true);
    } catch {
      setCameraReady(false);
      setStatus("Camera unavailable — GPS tracking is still active");
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const p = latestPointRef.current;
    if (!video || !canvas || !p || video.readyState < 2) return;
    if (Date.now() - lastFrameRef.current < 1200) return;
    lastFrameRef.current = Date.now();

    canvas.width = 640;
    canvas.height = Math.max(360, Math.round(640 * video.videoHeight / Math.max(video.videoWidth, 1)));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
    if (!blob) return;

    try {
      const client = await connectHF();
      // The Hugging Face generated example uses named inputs, not an array.
      const result = await client.predict(HF_API, { image: blob, confidence });
      const data = Array.isArray(result.data) ? result.data : [];
      const annotated = getFileUrl(data[0]);
      if (annotated) setAnnotatedUrl(annotated);
      const payload = parsePayload(data[1]);
      const detections: Detection[] = (payload.detections ?? [])
        .filter((d) => String(d.class ?? "").toUpperCase() === "D40" || String(d.class ?? "").toLowerCase() === "pothole")
        .map((d, index) => {
          const b = d.bbox_xyxy ?? d.box ?? [];
          const x1 = Number(b[0] ?? 0), y1 = Number(b[1] ?? 0), x2 = Number(b[2] ?? 0), y2 = Number(b[3] ?? 0);
          return { id: `${p.timestamp}-${index}-${x1}`, lat: p.lat, lng: p.lng, confidence: Number(d.confidence ?? 0), source: "camera", timestamp: p.timestamp, box: [x1 / 640, y1 / 480, Math.max(0, x2 - x1) / 640, Math.max(0, y2 - y1) / 480], className: "pothole" };
        });
      setPotholes((old) => dedupe([...old, ...detections]));
      if (detections.length) setLastConfidence(Math.max(...detections.map((d) => d.confidence)));
      setApiOnline(true);
      setStatus(detections.length ? `${detections.length} pothole${detections.length > 1 ? "s" : ""} detected` : "Scanning road surface…");
    } catch (error) {
      console.error("Transpox Gradio request failed", error);
      clientRef.current = null;
      reconnectLater();
    }
  }

  function startRide() {
    if (!navigator.geolocation) { setStatus("GPS is not supported on this device"); return; }
    setPoints([]); setPotholes([]); setDuration(0); setLastConfidence(0); setAnnotatedUrl(null); setApiOnline(null);
    latestPointRef.current = null; lastFrameRef.current = 0;
    setRunning(true); startTimeRef.current = Date.now(); setStatus("Starting GPS + camera + AI…");
    watchId.current = navigator.geolocation.watchPosition((pos) => {
      const p: Point = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed ?? undefined, heading: pos.coords.heading ?? undefined, timestamp: pos.timestamp };
      latestPointRef.current = p;
      setPoints((old) => [...old, p]);
      setSpeed((p.speed ?? 0) * 3.6);
    }, () => setStatus("GPS permission/error — allow location access"), { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
    void startMotion();
    void startCamera();
    void connectHF().catch(() => reconnectLater());
  }

  function stopRide() {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    window.removeEventListener("devicemotion", onMotion);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clientRef.current = null;
    latestPointRef.current = null;
    setCameraReady(false);
    setRunning(false);
    setStatus("Ride ended — route summary ready");
  }

  const distance = points.reduce((sum, p, i) => i ? sum + distanceMeters(points[i - 1], p) : 0, 0);
  const avgSpeed = distance && duration ? distance / duration * 3.6 : 0;
  const accuracy = points.at(-1)?.accuracy;

  return <main className="app">
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark"><span>TP</span></div><div><div className="brand">TRANSP<span>O</span>X</div><div className="brand-sub">ROAD INTELLIGENCE</div></div></div><div className="ride-state"><div className={`status-pill ${running ? "is-live" : ""}`}><i />{running ? "LIVE SCAN" : "STANDBY"}</div>{running && <button className="end" onClick={stopRide}>End ride</button>}</div></header>
    <section className="hero-copy"><div><p className="eyebrow">COMMUNITY ROAD MAPPING</p><h1>See the road.<br /><em>Know the road.</em></h1><p className="hero-text">Transpox turns your phone into a live road-sensing device — detecting potholes, mapping your route and building a smarter picture of the roads around you.</p></div><div className="hero-note"><strong>{potholes.length}</strong><span>potholes found<br />this ride</span></div></section>
    <section className="metrics"><div><span>DETECTIONS</span><strong>{String(potholes.length).padStart(2, "0")}</strong><small>road hazards</small></div><div><span>DISTANCE</span><strong>{(distance / 1000).toFixed(2)} <small>km</small></strong><small>route covered</small></div><div><span>RIDE TIME</span><strong>{formatDuration(duration)}</strong><small>active duration</small></div><div><span>CONFIDENCE</span><strong>{lastConfidence ? `${Math.round(lastConfidence * 100)}%` : "—"}</strong><small>best detection</small></div></section>
    <section className="live-panel"><div className="camera-panel"><video ref={videoRef} muted playsInline />{annotatedUrl && running && <img className="annotated-feed" src={annotatedUrl} alt="YOLO pothole detections" />}<div className="scan-grid" /><div className="detection-overlay">{potholes.filter((d) => d.box).map((d) => <div key={d.id} className="box pothole-box" style={{ left: `${d.box![0] * 100}%`, top: `${d.box![1] * 100}%`, width: `${d.box![2] * 100}%`, height: `${d.box![3] * 100}%` }}><span>POTHOLE · {Math.round(d.confidence * 100)}%</span></div>)}</div>{!running && <div className="camera-idle"><div className="idle-icon">◎</div><strong>Camera feed offline</strong><span>Press Start Ride to begin road scanning</span></div>}{running && !cameraReady && <div className="camera-idle compact"><strong>Camera permission required</strong><span>Allow camera access to enable pothole detection</span></div>}<div className="camera-top"><span>REAR CAMERA · YOLOv12</span><span className="camera-live"><i />{running ? "REC" : "READY"}</span></div><div className="camera-status"><i className={apiOnline === false ? "bad" : ""} />{status}</div></div><canvas ref={canvasRef} hidden /><div className="map-panel"><RideMap points={points} potholes={potholes} vehicles={vehicles} /></div></section>
    <section className="control-bar"><div className="control-main"><button className="start" onClick={running ? stopRide : startRide}>{running ? "End current ride" : "Start a ride"}<span>→</span></button><div className="permission-note"><i />GPS {accuracy ? `${Math.round(accuracy)}m accuracy` : "ready"}<b>·</b> Camera {cameraReady ? "connected" : "standby"}</div></div><div className="connection"><span className={apiOnline === false ? "offline" : apiOnline ? "online" : "checking"} /> Hugging Face API <b>{apiOnline === false ? "Reconnecting" : apiOnline ? "Online" : "Waking"}</b></div></section>
    <section className="bottom-stats"><div><span>SPEED</span><b>{speed.toFixed(0)}</b><small>km/h</small></div><div><span>AVG SPEED</span><b>{avgSpeed.toFixed(0)}</b><small>km/h</small></div><div><span>MOTION</span><b>{motion.toFixed(1)}</b><small>sensor signal</small></div><div><span>VEHICLES</span><b>{vehicles.length}</b><small>nearby detections</small></div></section>
    <footer><span>TRANSP<span>O</span>X</span><span>Road detection is informational. Stay focused on the road.</span><span>YOLOv12 · HF GRADIO · v1.3</span></footer>
  </main>;
}
