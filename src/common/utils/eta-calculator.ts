export type CheckpointEtaInput = {
  distanceFromOrigin: number;
};

export type CheckpointEtaResult = {
  distanceFromPrevious: number;
  etaFromStartMinutes: number;
  arrivalTimeIso: string;
};

export type TripEtaSummary = {
  estimatedArrivalIso: string;
  totalDurationMinutes: number;
  checkpointEtas: CheckpointEtaResult[];
};

const DEFAULT_AVG_SPEED_KMPH = 70;
const DEFAULT_STOP_BUFFER_MINUTES = 15;

/**
 * Calculates ETAs for checkpoint arrivals and final destination based on
 * average speed and per-stop delay assumptions.
 */
export function calculateTripEta(
  departureTimeIso: string,
  totalDistanceKm: number,
  checkpoints: CheckpointEtaInput[],
  avgSpeedKmph = DEFAULT_AVG_SPEED_KMPH,
  stopBufferMinutes = DEFAULT_STOP_BUFFER_MINUTES
): TripEtaSummary {
  const departureMs = new Date(departureTimeIso).getTime();
  let previousDistance = 0;

  const checkpointEtas = checkpoints.map((checkpoint, index) => {
    const pureDriveMinutes = kmToMinutes(checkpoint.distanceFromOrigin, avgSpeedKmph);
    const elapsedMinutes = pureDriveMinutes + index * stopBufferMinutes;
    const distanceFromPrevious = checkpoint.distanceFromOrigin - previousDistance;

    previousDistance = checkpoint.distanceFromOrigin;

    return {
      distanceFromPrevious: round2(distanceFromPrevious),
      etaFromStartMinutes: Math.round(elapsedMinutes),
      arrivalTimeIso: new Date(departureMs + elapsedMinutes * 60_000).toISOString()
    };
  });

  const destinationDriveMinutes = kmToMinutes(totalDistanceKm, avgSpeedKmph);
  const totalDurationMinutes = Math.round(
    destinationDriveMinutes + checkpoints.length * stopBufferMinutes
  );

  return {
    estimatedArrivalIso: new Date(departureMs + totalDurationMinutes * 60_000).toISOString(),
    totalDurationMinutes,
    checkpointEtas
  };
}

export type TimedCheckpoint = {
  distanceFromOriginKm: number;
  stopDurationMinutes: number;
};

export type TimedCheckpointResult = {
  distanceFromPreviousKm: number;
  drivingTimeFromStartMinutes: number;
  stopDurationMinutes: number;
  arrivalTimeIso: string;
  departureTimeIso: string;
};

/**
 * Calculates arrival/departure times for checkpoints and final arrival time.
 *
 * Notes:
 * - Uses distance-proportional interpolation for driving time; for better accuracy
 *   this can be replaced later with leg-walking on Google Directions `legs/steps`.
 * - Adds stop durations cumulatively.
 */
export function calculateETAs(params: {
  departureTime: Date;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  checkpoints: TimedCheckpoint[];
}): { checkpoints: TimedCheckpointResult[]; estimatedArrivalIso: string; totalDurationMinutes: number } {
  const results: TimedCheckpointResult[] = [];
  let cumulativeStop = 0;
  let prevDistance = 0;

  for (const cp of params.checkpoints) {
    const driving = Math.round((cp.distanceFromOriginKm / params.totalDistanceKm) * params.totalDurationMinutes);
    const arrival = addMinutes(params.departureTime, driving + cumulativeStop);
    const departure = addMinutes(arrival, cp.stopDurationMinutes);

    results.push({
      distanceFromPreviousKm: round2(cp.distanceFromOriginKm - prevDistance),
      drivingTimeFromStartMinutes: driving,
      stopDurationMinutes: cp.stopDurationMinutes,
      arrivalTimeIso: arrival.toISOString(),
      departureTimeIso: departure.toISOString()
    });

    prevDistance = cp.distanceFromOriginKm;
    cumulativeStop += cp.stopDurationMinutes;
  }

  const totalDurationWithStops = Math.round(params.totalDurationMinutes + cumulativeStop);
  const estimatedArrival = addMinutes(params.departureTime, totalDurationWithStops);

  return {
    checkpoints: results,
    estimatedArrivalIso: estimatedArrival.toISOString(),
    totalDurationMinutes: totalDurationWithStops
  };
}

function kmToMinutes(distanceKm: number, avgSpeedKmph: number): number {
  return (distanceKm / avgSpeedKmph) * 60;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
