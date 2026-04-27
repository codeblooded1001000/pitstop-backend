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

function kmToMinutes(distanceKm: number, avgSpeedKmph: number): number {
  return (distanceKm / avgSpeedKmph) * 60;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
