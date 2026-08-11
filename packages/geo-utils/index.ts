export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const R = 6371000;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function dedupePotholes<T extends { lat: number; lng: number }>(events: T[], radiusMeters = 12) {
  const result: T[] = [];
  for (const event of events) if (!result.some((x) => distanceMeters(x, event) < radiusMeters)) result.push(event);
  return result;
}
