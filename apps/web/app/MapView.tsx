"use client";

import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };
type Detection = { id: string; lat: number; lng: number; confidence: number; source: string };

const potholeIcon = L.divIcon({ className: "pothole-pin", html: "<span>●</span>", iconSize: [28, 28], iconAnchor: [14, 14] });
const vehicleIcon = L.divIcon({ className: "vehicle-pin", html: "🚗", iconSize: [28, 28], iconAnchor: [14, 14] });

export default function MapView({ points, potholes, vehicles }: { points: Point[]; potholes: Detection[]; vehicles: Detection[] }) {
  const center = points.at(-1) ? [points.at(-1)!.lat, points.at(-1)!.lng] as [number, number] : [25.318, 82.568] as [number, number];
  return <MapContainer center={center} zoom={15} scrollWheelZoom className="map">
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {points.length > 1 && <Polyline positions={points.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#1688ff", weight: 6 }} />}
    {points.at(0) && <CircleMarker center={[points[0].lat, points[0].lng]} radius={9} pathOptions={{ color: "#13a34a", fillColor: "#13a34a", fillOpacity: 1 }}><Popup>Ride start</Popup></CircleMarker>}
    {points.at(-1) && <CircleMarker center={[points.at(-1)!.lat, points.at(-1)!.lng]} radius={10} pathOptions={{ color: "#1677ff", fillColor: "#1677ff", fillOpacity: 1 }}><Popup>Current location</Popup></CircleMarker>}
    {potholes.map((p) => <Marker key={p.id} position={[p.lat, p.lng]} icon={potholeIcon}><Popup>Road pothole · {Math.round(p.confidence * 100)}% confidence</Popup></Marker>)}
    {vehicles.map((v) => <Marker key={v.id} position={[v.lat, v.lng]} icon={vehicleIcon}><Popup>Upcoming vehicle</Popup></Marker>)}
    <div className="map-legend"><b>Legend</b><span><i className="legend-hole" /> Pothole</span><span><i className="legend-car" /> Upcoming vehicle</span></div>
  </MapContainer>;
}
