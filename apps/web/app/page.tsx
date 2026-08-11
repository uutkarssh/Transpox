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

export default function Home() {
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [potholes, setPotholes] = useState<Detection[]>([]);
  const [vehicles, setVehicles] = useState<Detection[]>([]);
  const [status, setStatus] = useState("Ready to ride");
  const [motion, setMotion] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [duration, setDuration] = useState(0);
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

  function startMotion() { window.addEventListener("devicemotion", onMotion); }
  function onMotion(event: DeviceMotionEvent) {
    const a = event.accelerationIncludingGravity;
    if (!a) return;
    setMotion(Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2));
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch { setStatus("Camera unavailable — GPS ride continues"); }
  }

  async function captureFrame() {
    if (!videoRef.current || !canvasRef.current || !points.length) return;
    const now = Date.now();
    if (now - lastFrame.current < 1200) return;
    lastFrame.current = now;
    const video = videoRef.current, canvas = canvasRef.current;
    canvas.width = 640; canvas.height = Math.round(640 * video.videoHeight / Math.max(video.videoWidth, 1));
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .72));
    if (!blob) return;
    const p = points.at(-1)!;
    const form = new FormData();
    form.append("image", blob, "frame.jpg"); form.append("lat", String(p.lat)); form.append("lng", String(p.lng));
    form.append("timestamp", String(p.timestamp)); form.append("motion", String(motion));
    try {
      const r = await fetch(`${API}/detect`, { method: "POST", body: form });
      if (!r.ok) return;
      const data = await r.json();
      setPotholes((old) => dedupe([...old, ...(data.detections ?? [])].filter((d: Detection) => d.className !== "vehicle")));
      setVehicles((old) => [...old, ...(data.vehicles ?? [])]);
    } catch { /* Backend can be unavailable while tracking continues. */ }
  }

  function dedupe(items: Detection[]) {
    const out: Detection[] = [];
    for (const item of items) if (!out.some((x) => distanceMeters(x, item) < 12)) out.push(item);
    return out;
  }

  async function startRide() {
    if (!navigator.geolocation) return setStatus("GPS is not supported");
    setPoints([]); setPotholes([]); setVehicles([]); setDuration(0); setRunning(true); startTime.current = Date.now();
    setStatus("Starting GPS + camera…");
    watchId.current = navigator.geolocation.watchPosition((position) => {
      const p = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, speed: position.coords.speed ?? undefined, heading: position.coords.heading ?? undefined, timestamp: position.timestamp };
      setPoints((old) => [...old, p]); setSpeed((p.speed ?? 0) * 3.6); setStatus("Live ride");
    }, () => setStatus("GPS permission/error"), { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
    startMotion(); await startCamera();
  }

  function stopRide() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null; window.removeEventListener("devicemotion", onMotion);
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setRunning(false);
    setStatus("Ride ended");
  }

  useEffect(() => { if (!running) return; const id = window.setInterval(captureFrame, 500); return () => window.clearInterval(id); }, [running, points, motion]);

  const distance = points.reduce((sum, p, i) => i ? sum + distanceMeters(points[i - 1], p) : 0, 0);
  const avgSpeed = distance && duration ? distance / duration * 3.6 : 0;
  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return <main className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">●</span>Transpox</div>
      <div className="ride-state"><span className={running ? "rec live" : "rec"}>● {running ? "REC" : "READY"}</span><button className="end" onClick={stopRide} disabled={!running}>End Ride</button></div>
    </header>

    <section className="metrics">
      <div><span>Potholes</span><strong>{String(potholes.length).padStart(2, "0")}</strong></div>
      <div><span>Distance</span><strong>{(distance / 1000).toFixed(2)} <small>km</small></strong></div>
      <div><span>Duration</span><strong>{fmt(duration)}</strong></div>
    </section>

    <section className="live-panel">
      <div className="camera-panel">
        <video ref={videoRef} muted playsInline />
        <div className="detection-overlay">
          {potholes.filter((d) => d.box).map((d) => <div key={d.id} className="box pothole-box" style={{ left: `${d.box![0] * 100}%`, top: `${d.box![1] * 100}%`, width: `${d.box![2] * 100}%`, height: `${d.box![3] * 100}%` }}><span>ROAD POTHOLE</span></div>)}
          {vehicles.filter((d) => d.box).map((d) => <div key={d.id} className="box vehicle-box" style={{ left: `${d.box![0] * 100}%`, top: `${d.box![1] * 100}%`, width: `${d.box![2] * 100}%`, height: `${d.box![3] * 100}%` }}><span>VEHICLE</span></div>)}
        </div>
        {!running && <div className="camera-idle">Camera preview appears when you start a ride</div>}
        <div className="camera-status">{status}</div>
      </div>
      <canvas ref={canvasRef} hidden />
      <div className="map-panel"><RideMap points={points} potholes={potholes} vehicles={vehicles} /></div>
    </section>

    <div className="action-row"><button className="start" onClick={startRide} disabled={running}>{running ? "Ride in progress" : "Start Ride"}</button><span>GPS accuracy: {points.at(-1)?.accuracy ? `${Math.round(points.at(-1)!.accuracy!)} m` : "—"}</span></div>

    <section className="bottom-stats"><div><b>{speed.toFixed(0)}</b><span>km/h speed</span></div><div><b>{avgSpeed.toFixed(0)}</b><span>km/h avg</span></div><div><b>{motion.toFixed(1)}</b><span>motion signal</span></div><div><b>{vehicles.length}</b><span>vehicles nearby</span></div></section>
  </main>;
}
