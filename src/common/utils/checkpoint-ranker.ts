import { Checkpoint, CheckpointType, Vehicle, VehicleType } from "@prisma/client";
import { RangeSummary } from "./range-calculator";

export type CheckpointPriority = "REQUIRED" | "RECOMMENDED" | "OPTIONAL";

export type RankedCheckpoint = {
  checkpoint: Checkpoint;
  priority: CheckpointPriority;
  reasoning: string;
};

const IDEAL_SEGMENT_KM = 100;
const MAX_SEGMENT_KM = 150;
const MIN_FIRST_STOP_DISTANCE = 50;
const MAX_CHECKPOINTS = 4;

type ScoredCheckpoint = {
  checkpoint: Checkpoint;
  score: number;
  priority: CheckpointPriority;
};

/**
 * Produces ranked checkpoints for a trip using range constraints,
 * segment windows, and amenity/quality scoring.
 */
export function rankCheckpointsForTrip(params: {
  vehicle: Vehicle;
  range: RangeSummary;
  checkpoints: Checkpoint[];
  totalDistanceKm: number;
}): RankedCheckpoint[] {
  const { vehicle, range, checkpoints, totalDistanceKm } = params;
  const selected: RankedCheckpoint[] = [];
  const pickedCheckpointIds = new Set<string>();

  for (
    let segmentStart = 0;
    segmentStart < totalDistanceKm && selected.length < MAX_CHECKPOINTS;
    segmentStart += IDEAL_SEGMENT_KM
  ) {
    const windowStart = segmentStart + MIN_FIRST_STOP_DISTANCE;
    const windowEnd = Math.min(segmentStart + MAX_SEGMENT_KM, totalDistanceKm);

    const eligible = checkpoints.filter(
      (c) =>
        !pickedCheckpointIds.has(c.id) &&
        c.distanceFromDelhi >= windowStart &&
        c.distanceFromDelhi <= windowEnd
    );

    if (eligible.length === 0) {
      continue;
    }

    const isRefuelWindow =
      range.needsRefuel &&
      range.refuelByKm !== null &&
      range.refuelByKm >= windowStart &&
      range.refuelByKm <= windowEnd;

    const scored: ScoredCheckpoint[] = eligible
      .map((checkpoint) => ({
        checkpoint,
        score: scoreCheckpoint(checkpoint, vehicle, isRefuelWindow),
        priority: (isRefuelWindow ? "REQUIRED" : "RECOMMENDED") as CheckpointPriority
      }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    pickedCheckpointIds.add(best.checkpoint.id);
    selected.push({
      checkpoint: best.checkpoint,
      priority: best.priority,
      reasoning: buildReasoning(best.checkpoint, best.priority, selected.length)
    });
  }

  return selected.slice(0, MAX_CHECKPOINTS);
}

function scoreCheckpoint(
  checkpoint: Checkpoint,
  vehicle: Vehicle,
  isRefuelWindow: boolean
): number {
  let score = (checkpoint.rating ?? 3.5) * 2;

  if (checkpoint.hasCleanRestroom) score += 2;
  if (checkpoint.hasParking) score += 1;

  const typeMatchToNeed = calculateTypeNeedScore(checkpoint, vehicle.type, isRefuelWindow);
  score += typeMatchToNeed * 3;

  return score;
}

function calculateTypeNeedScore(
  checkpoint: Checkpoint,
  vehicleType: VehicleType,
  isRefuelWindow: boolean
): number {
  if (isRefuelWindow) {
    if (vehicleType === VehicleType.EV || vehicleType === VehicleType.HYBRID) {
      return checkpoint.hasEVCharger ? 2 : 0;
    }
    return checkpoint.hasFuel ? 2 : 0;
  }

  if (checkpoint.hasFood) return 1;
  if (checkpoint.type.includes(CheckpointType.REST_AREA)) return 1;
  return 0;
}

function buildReasoning(
  checkpoint: Checkpoint,
  priority: CheckpointPriority,
  selectedIndex: number
): string {
  if (priority === "REQUIRED") {
    return "Refuel here - you'd hit 15% usable range otherwise.";
  }

  if (selectedIndex === 0) {
    return "Perfect first break, roughly 1 hour into the drive.";
  }

  if ((checkpoint.rating ?? 0) >= 4.4 && checkpoint.highlights.length > 0) {
    return `Highly rated stop, known for ${checkpoint.highlights[0]}.`;
  }

  if (checkpoint.distanceFromDelhi >= 120 && checkpoint.distanceFromDelhi <= 170) {
    return "Halfway point with reliable amenities for a reset.";
  }

  return "Recommended comfort stop based on amenities and travel flow.";
}
