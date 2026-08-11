"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const RideMap = dynamic(() => import("./MapView"), { ssr: false });
const API = process.env.NEXT_PUBLIC_DETECTION_API ?? "http://localhost:8000";

type Point = { lat: number; lng: number; timestamp: number; accuracy?: number; speed?: number; heading?: number };
type Detection = { id: string; lat: number; lng: number; confidence: number; source: string; timestamp: number; box?: [number, number, number, number]; className?: string };

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

export default function Home() {
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [potholes, setPotholes] = useState<Detection[]>([]);
  const [vehicles, setVehicles] = useState<Detection[]>([]);
  const [status, setStatus] = useState("Ready to scan the road");
  const [motion, setMotion] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastConfidence, setLastConfidence] = useState(0);
  const watchId = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFrame = useRef(0);
  const startTime = useRef(0);

  useEffect(() => () => stopRide(), []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setDuration(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(captureFrame, 500);
    return () => window.clearInterval(id);
  }, [running, points, motion]);

  useEffect(() => {
    if (!running) return;
    fetch(`${API}/health`, { cache: "no-store" })
      .then((r) => { setApiOnline(r.ok); })
      .catch(() => setApiOnline(false));
  }, [running]);

  function onMotion(event: DeviceMotionEvent) {
    const a = event.accelerationIncludingGravity;
    if (!a) return;
    setMotion(Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2));
  }

  async function startMotion() {
    try {
      const permission = (DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }).requestPermission;
      if (permission) await permission();
    } catch { /* Motion is optional. */ }
    window.addEventListener("devicemotion", onMotion);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraReady(true);
      return true;
    } catch {
      setCameraReady(false);
      setStatus("Camera unavailable — GPS tracking is still active");
      return false;
    }
  }

  async function captureFrame() {
    if (!videoRef.current || !canvasRef.current || !points.length || videoRef.current.readyState < 2) return;
    const now = Date.now();
    if (now - lastFrame.current < 1200) return;
    lastFrame.current = now;
    const video = videoRef.current, canvas = canvasRef.current;
    canvas.width = 640;
    canvas.height = Math.max(360, Math.round(640 * video.videoHeight / Math.max(video.videoWidth, 1)));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .72));
    if (!blob) return;
    const p = points.at(-1)!;
    const form = new FormData();
    form.append("image", blob, "frame.jpg");
    form.append("lat", String(p.lat));
    form.append("lng", String(p.lng));
    form.append("timestamp", String(p.timestamp));
    form.append("motion", String(motion));
    try {
      const r = await fetch(`${API}/detect`, { method: "POST", body: form });
      if (!r.ok) { setApiOnline(false); return; }
      setApiOnline(true);
      const data = await r.json();
      const detections = (data.detections ?? []) as Detection[];
      if (detections.length) setLastConfidence(Math.max(...detections.map((d) => d.confidence ?? 0)));
      setPotholes((old) => dedupe([...old, ...detections].filter((d) => d.className !== "vehicle")));
      setVehicles((old) => [...old, ...(data.vehicles ?? [])]);
      setStatus(detections.length ? `${detections.length} pothole${detections.length > 1 ? "s" : ""} detected` : "Scanning road surface…");
    } catch {
      setApiOnline(false);
      setStatus("Detection server unavailable — ride tracking continues");
    }
  }

  function startRide() {
    if (!navigator.geolocation) return setStatus("GPS is not supported on this device");
    setPoints([]); setPotholes([]); setVehicles([]); setDuration(0); setLastConfidence(0); setApiOnline(null);
    setRunning(true); startTime.current = Date.now(); setStatus("Starting GPS + camera…");
    watchId.current = navigator.geolocation.watchPosition((position) => {
      const p = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, speed: position.coords.speed ?? undefined, heading: position.coords.heading ?? undefined, timestamp: position.timestamp };
      setPoints((old) => [...old, p]);
      setSpeed((p.speed ?? 0) * 3.6);
      setStatus((old) => old.startsWith("Detection server") ? old : "Live road scan");
    }, () => setStatus("GPS permission/error — check location access"), { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
    startMotion();
    startCamera();
  }

  function stopRide() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    window.removeEventListener("devicemotion", onMotion);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setRunning(false);
    setStatus("Ride ended — route summary ready");
  }

  const distance = points.reduce((sum, p, i) => i ? sum + distanceMeters(points[i - 1], p) : 0, 0);
  const avgSpeed = distance && duration ? distance / duration * 3.6 : 0;
  const accuracy = points.at(-1)?.accuracy;

  return <main className="app">
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark"><span>TP</span></div>
        <div><div className="brand">TRANSP<span>O</span>X</div><div className="brand-sub">ROAD INTELLIGENCE</div></div>
      </div>
      <div className="ride-state">
        <div className={`status-pill ${running ? "is-live" : ""}`}><i />{running ? "LIVE SCAN" : "STANDBY"}</div>
        {running && <button className="end" onClick={stopRide}>End ride</button>}
      </div>
    </header>

    <section className="hero-copy">
      <div><p className="eyebrow">COMMUNITY ROAD MAPPING</p><h1>See the road.<br /><em>Know the road.</em></h1><p className="hero-text">Transpox turns your phone into a live road-sensing device — detecting potholes, mapping your route and building a smarter picture of the roads around you.</p></div>
      <div className="hero-note"><strong>{potholes.length}</strong><span>potholes found<br />this ride</span></div>
    </section>

    <section className="metrics">
      <div><span>DETECTIONS</span><strong>{String(potholes.length).padStart(2, "0")}</strong><small>road hazards</small></div>
      <div><span>DISTANCE</span><strong>{(distance / 1000).toFixed(2)} <small>km</small></strong><small>route covered</small></div>
      <div><span>RIDE TIME</span><strong>{formatDuration(duration)}</strong><small>active duration</small></div>
      <div><span>CONFIDENCE</span><strong>{lastConfidence ? `${Math.round(lastConfidence * 100)}%` : "—"}</strong><small>best detection</small></div>
    </section>

    <section className="live-panel">
      <div className="camera-panel">
        <video ref={videoRef} muted playsInline />
        <div className="scan-grid" />
        <div className="detection-overlay">
          {potholes.filter((d) => d.box).map((d) => <div key={d.id} className="box pothole-box" style={{ left: `${d.box![0] * 100}%`, top: `${d.box![1] * 100}%`, width: `${d.box![2] * 100}%`, height: `${d.box![3] * 100}%` }}><span>POTHOLE · {Math.round(d.confidence * 100)}%</span></div>)}
          {vehicles.filter((d) => d.box).map((d) => <div key={d.id} className="box vehicle-box" style={{ left: `${d.box![0] * 100}%`, top: `${d.box![1] * 100}%`, width: `${d.box![2] * 100}%`, height: `${d.box![3] * 100}%` }}><span>VEHICLE</span></div>)}
        </div>
        {!running && <div className="camera-idle"><div className="idle-icon">◎</div><strong>Camera feed offline</strong><span>Press Start Ride to begin road scanning</span></div>}
        {running && !cameraReady && <div className="camera-idle compact"><strong>Camera permission required</strong><span>Allow camera access to enable pothole detection</span></div>}
        <div className="camera-top"><span>REAR CAMERA</span><span className="camera-live"><i />{running ? "REC" : "READY"}</span></div>
        <div className="camera-status"><i className={apiOnline === false ? "bad" : ""} />{status}</div>
      </div>
      <canvas ref={canvasRef} hidden />
      <div className="map-panel"><RideMap points={points} potholes={potholes} vehicles={vehicles} /></div>
    </section>

    <section className="control-bar">
      <div className="control-main"><button className="start" onClick={running ? stopRide : startRide}>{running ? "End current ride" : "Start a ride"}<span>→</span></button><div className="permission-note"><i />GPS {accuracy ? `${Math.round(accuracy)}m accuracy` : "ready"}<b>·</b> Camera {cameraReady ? "connected" : "standby"}</div></div>
      <div className="connection"><span className={apiOnline === false ? "offline" : apiOnline ? "online" : "checking"} /> Detection API <b>{apiOnline === false ? "Offline" : apiOnline ? "Online" : "Checking"}</b></div>
    </section>

    <section className="bottom-stats">
      <div><span>SPEED</span><b>{speed.toFixed(0)}</b><small>km/h</small></div>
      <div><span>AVG SPEED</span><b>{avgSpeed.toFixed(0)}</b><small>km/h</small></div>
      <div><span>MOTION</span><b>{motion.toFixed(1)}</b><small>sensor signal</small></div>
      <div><span>VEHICLES</span><b>{vehicles.length}</b><small>nearby detections</small></div>
    </section>

    <footer><span>TRANSP<span>O</span>X</span><span>Road detection is informational. Stay focused on the road.</span><span>v1.0 · LIVE</span></footer>
  </main>;
}
