export type GeoPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
};

export type PotholeEvent = {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  confidence: number;
  source: "vision" | "motion" | "fused";
};

export type Ride = {
  id: string;
  startedAt: number;
  endedAt?: number;
  start: GeoPoint;
  end?: GeoPoint;
  route: GeoPoint[];
  potholes: PotholeEvent[];
};
