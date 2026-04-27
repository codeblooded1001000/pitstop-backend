import { Vehicle } from "@prisma/client";

export type RangeSummary = {
  currentRangeKm: number;
  usableRangeKm: number;
  needsRefuel: boolean;
  refuelByKm: number | null;
};

/**
 * Derives current drivable range using vehicle real-world range and
 * remaining fuel/charge percentage while enforcing a 15% safety buffer.
 */
export function calculateRangeSummary(
  vehicle: Vehicle,
  fuelPercent: number,
  totalDistanceKm: number
): RangeSummary {
  const boundedFuelPercent = Math.min(Math.max(fuelPercent, 0), 100);
  const currentRangeKm = (boundedFuelPercent / 100) * vehicle.realWorldRange;
  const usableRangeKm = currentRangeKm * 0.85;
  const needsRefuel = usableRangeKm < totalDistanceKm;

  return {
    currentRangeKm: round2(currentRangeKm),
    usableRangeKm: round2(usableRangeKm),
    needsRefuel,
    refuelByKm: needsRefuel ? round2(usableRangeKm) : null
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
