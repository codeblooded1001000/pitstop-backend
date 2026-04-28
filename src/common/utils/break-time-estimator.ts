export interface BreakTimeEstimate {
  totalMinutes: number;
  formatted: string;
  estimatedStops: number;
  subtitle: string;
}

/**
 * Estimates total break time and number of planned stops based on trip duration.
 * Used by "Trip at a Glance" — heuristic preview without running the full checkpoint ranker.
 */
export function estimateBreakTime(distanceKm: number, drivingMinutes: number): BreakTimeEstimate {
  void distanceKm;
  // Stop frequency: roughly every 1.5 hours of driving.
  const idealStopEveryMinutes = 90;
  const estimatedStops = Math.max(0, Math.floor(drivingMinutes / idealStopEveryMinutes));

  // Average stop duration: ~20 min (mix of fuel ~10, food ~30, EV ~25).
  const avgStopMinutes = 20;
  const totalMinutes = estimatedStops * avgStopMinutes;

  return {
    totalMinutes,
    formatted: formatDuration(totalMinutes),
    estimatedStops,
    subtitle:
      estimatedStops === 0 ? "No stops needed" : `${estimatedStops} planned ${estimatedStops === 1 ? "stop" : "stops"}`
  };
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

