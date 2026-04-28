import { createHash } from "node:crypto";

export function roundCoord(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildRouteHash(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}): string {
  const oLat = roundCoord(params.originLat, 3);
  const oLng = roundCoord(params.originLng, 3);
  const dLat = roundCoord(params.destinationLat, 3);
  const dLng = roundCoord(params.destinationLng, 3);
  const input = `${oLat}_${oLng}_${dLat}_${dLng}`;
  return createHash("sha256").update(input).digest("hex");
}

