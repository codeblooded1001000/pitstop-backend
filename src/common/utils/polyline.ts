import { haversineDistanceMeters, type LatLng } from "./geo";

// Google's Encoded Polyline Algorithm Format
// Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
export function decodeEncodedPolyline(encoded: string): LatLng[] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: LatLng[] = [];

  while (index < len) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
}

export function polylineToWktLineString(points: LatLng[]): string {
  if (points.length < 2) {
    throw new Error("Need at least two points to build LINESTRING");
  }
  const coords = points.map((p) => `${p.lng} ${p.lat}`).join(", ");
  return `LINESTRING(${coords})`;
}

export function sampleAlongPolyline(encoded: string, intervalMeters: number): LatLng[] {
  const pts = decodeEncodedPolyline(encoded);
  if (pts.length === 0) return [];
  if (pts.length === 1) return pts;

  const sampled: LatLng[] = [pts[0]];
  let carried = 0;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    let seg = haversineDistanceMeters(prev, curr);

    if (seg <= 0) continue;

    while (carried + seg >= intervalMeters) {
      const remaining = intervalMeters - carried;
      const t = remaining / seg;
      const lat = prev.lat + (curr.lat - prev.lat) * t;
      const lng = prev.lng + (curr.lng - prev.lng) * t;
      sampled.push({ lat, lng });

      // Continue along the remaining segment.
      const newPrev = { lat, lng };
      seg = haversineDistanceMeters(newPrev, curr);
      carried = 0;
    }

    carried += seg;
  }

  const last = pts[pts.length - 1];
  const lastSampled = sampled[sampled.length - 1];
  if (!lastSampled || haversineDistanceMeters(lastSampled, last) > intervalMeters * 0.25) {
    sampled.push(last);
  }

  return sampled;
}

