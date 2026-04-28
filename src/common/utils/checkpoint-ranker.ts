import { Checkpoint, Vehicle, VehicleType } from "@prisma/client";

export type CheckpointPriority = "REQUIRED" | "RECOMMENDED" | "OPTIONAL";

export type RankedCheckpoint = {
  checkpoint: Checkpoint;
  priority: CheckpointPriority;
  reasoning: string;
};

export type TripPreferences = {
  maxCheckpoints?: number;
  prioritize?: Array<"FOOD" | "FUEL" | "EV">;
  familyFriendly?: boolean;
};

export type CandidateAlongRoute = {
  checkpoint: Checkpoint;
  distanceFromOriginKm: number;
};

/**
 * Selects 3-6 checkpoints from candidates that are already filtered along a route.
 * The selection tries to create comfortable segments, and marks a stop as REQUIRED
 * when the vehicle's usable range would otherwise be exceeded.
 */
export function rankCheckpointsForTrip(params: {
  vehicle: Vehicle;
  candidatesAlongRoute: CandidateAlongRoute[];
  totalDistanceKm: number;
  fuelPercent: number;
  preferences?: TripPreferences;
}): RankedCheckpoint[] {
  const { vehicle, candidatesAlongRoute, totalDistanceKm, fuelPercent, preferences } = params;

  const maxCheckpoints = clampInt(preferences?.maxCheckpoints ?? 4, 3, 6);
  const currentRangeKm = (fuelPercent / 100) * vehicle.realWorldRange;
  const usableRangeKm = currentRangeKm * 0.85;
  const needsRefuel = usableRangeKm < totalDistanceKm;
  const refuelByKm = needsRefuel ? usableRangeKm : null;

  const idealSegmentKm = totalDistanceKm < 200 ? 80 : totalDistanceKm < 500 ? 120 : 150;
  const maxSegmentKm = idealSegmentKm * 1.5;

  const picked = new Set<string>();
  const selected: RankedCheckpoint[] = [];

  let currentKm = 0;
  while (currentKm + idealSegmentKm < totalDistanceKm - 50 && selected.length < maxCheckpoints) {
    const windowStart = currentKm + idealSegmentKm * 0.6;
    const windowEnd = Math.min(currentKm + maxSegmentKm, totalDistanceKm);

    const needsFuelHere =
      needsRefuel && refuelByKm !== null && refuelByKm >= windowStart && refuelByKm <= windowEnd;

    const eligible = candidatesAlongRoute
      .filter((c) => !picked.has(c.checkpoint.id))
      .filter((c) => c.distanceFromOriginKm >= windowStart && c.distanceFromOriginKm <= windowEnd);

    if (eligible.length === 0) {
      currentKm = windowEnd;
      continue;
    }

    const eligibleForScoring =
      needsFuelHere
        ? filterVehicleEnergyCompatible(eligible, vehicle.type).length > 0
          ? filterVehicleEnergyCompatible(eligible, vehicle.type)
          : eligible
        : eligible;

    const scored = eligibleForScoring
      .map((c) => ({
        candidate: c,
        score: scoreCheckpoint(c.checkpoint, {
          vehicleType: vehicle.type,
          needsFuelHere,
          preferences: preferences ?? {}
        })
      }))
      .sort((a, b) => b.score - a.score);

    const winner = scored[0]?.candidate;
    if (!winner) {
      currentKm = windowEnd;
      continue;
    }

    const priority = computePriority({
      checkpoint: winner.checkpoint,
      vehicleType: vehicle.type,
      needsFuelHere
    });

    picked.add(winner.checkpoint.id);
    selected.push({
      checkpoint: winner.checkpoint,
      priority,
      reasoning: buildReasoning(winner.checkpoint, {
        priority,
        needsFuelHere,
        index: selected.length,
        vehicleType: vehicle.type,
        preferences: preferences ?? {}
      })
    });
    currentKm = winner.distanceFromOriginKm;
  }

  ensureVehicleEnergyStop({
    selected,
    picked,
    candidatesAlongRoute,
    vehicleType: vehicle.type,
    maxCheckpoints,
    preferences: preferences ?? {}
  });

  return selected;
}

/**
 * Checkpoint scoring.
 * Higher scores are better.
 */
function scoreCheckpoint(
  checkpoint: Checkpoint,
  ctx: { vehicleType: VehicleType; needsFuelHere: boolean; preferences: TripPreferences }
): number {
  let score = (checkpoint.rating ?? 3.5) * 2;

  if (checkpoint.hasCleanRestroom) score += 1.5;
  if (checkpoint.hasParking) score += 0.5;
  if (checkpoint.isFamilyFriendly && ctx.preferences.familyFriendly) score += 1;

  if (ctx.needsFuelHere) {
    if ((ctx.vehicleType === VehicleType.EV || ctx.vehicleType === VehicleType.HYBRID) && checkpoint.hasEVCharger) {
      score += 10;
    } else if (ctx.vehicleType !== VehicleType.EV && checkpoint.hasFuel) {
      score += 10;
    }
  }

  const prioritize = ctx.preferences.prioritize ?? [];
  if (prioritize.includes("FOOD") && checkpoint.hasFood) score += 1.5;
  if (prioritize.includes("FUEL") && checkpoint.hasFuel) score += 1;
  if (prioritize.includes("EV") && checkpoint.hasEVCharger) score += 1;

  const daysOld = daysSince(checkpoint.lastVerifiedAt);
  if (daysOld > 60) score -= 1;
  if (daysOld > 90) score -= 2;

  return score;
}

function computePriority(params: {
  checkpoint: Checkpoint;
  vehicleType: VehicleType;
  needsFuelHere: boolean;
}): CheckpointPriority {
  if (!params.needsFuelHere) return "RECOMMENDED";

  const isEV = params.vehicleType === VehicleType.EV || params.vehicleType === VehicleType.HYBRID;
  if (isEV) return params.checkpoint.hasEVCharger ? "REQUIRED" : "RECOMMENDED";
  return params.checkpoint.hasFuel ? "REQUIRED" : "RECOMMENDED";
}

function buildReasoning(
  checkpoint: Checkpoint,
  ctx: {
    priority: CheckpointPriority;
    needsFuelHere: boolean;
    index: number;
    vehicleType: VehicleType;
    preferences: TripPreferences;
  }
): string {
  const highlights = Array.isArray((checkpoint as unknown as { highlights?: unknown }).highlights)
    ? ((checkpoint as unknown as { highlights: string[] }).highlights)
    : [];

  if (ctx.priority === "REQUIRED") {
    if (checkpoint.hasEVCharger) return "⚡ Charge here — it’s the safest stop to stay within range.";
    if (checkpoint.hasFuel) return "⛽ Refuel here — it’s the safest stop to stay within range.";
    return "Refuel/charge recommended here to stay within range.";
  }

  if (ctx.index === 0) {
    return addCompatibilityNote(
      "Perfect first break — roughly an hour into the drive.",
      checkpoint,
      ctx.vehicleType
    );
  }

  if ((checkpoint.rating ?? 0) >= 4.4 && highlights.length > 0) {
    return addCompatibilityNote(
      `Highly rated stop, known for ${highlights[0]}.`,
      checkpoint,
      ctx.vehicleType
    );
  }

  return addCompatibilityNote(
    "Recommended comfort stop based on amenities and travel flow.",
    checkpoint,
    ctx.vehicleType
  );
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function daysSince(date: Date): number {
  const ms = Date.now() - date.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function addCompatibilityNote(base: string, checkpoint: Checkpoint, vehicleType: VehicleType): string {
  if (vehicleType === VehicleType.EV && !checkpoint.hasEVCharger) {
    return `${base} Note: this is a comfort break only, not an EV charging stop.`;
  }
  if (vehicleType !== VehicleType.EV && !checkpoint.hasFuel) {
    return `${base} Note: this stop is for rest/food, not for fuel refill.`;
  }
  return base;
}

function filterVehicleEnergyCompatible(
  candidates: CandidateAlongRoute[],
  vehicleType: VehicleType
): CandidateAlongRoute[] {
  return candidates.filter((c) => isVehicleEnergyCompatible(c.checkpoint, vehicleType));
}

function isVehicleEnergyCompatible(checkpoint: Checkpoint, vehicleType: VehicleType): boolean {
  if (vehicleType === VehicleType.EV) {
    return checkpoint.hasEVCharger;
  }
  return checkpoint.hasFuel;
}

function ensureVehicleEnergyStop(params: {
  selected: RankedCheckpoint[];
  picked: Set<string>;
  candidatesAlongRoute: CandidateAlongRoute[];
  vehicleType: VehicleType;
  maxCheckpoints: number;
  preferences: TripPreferences;
}): void {
  const hasRequiredType = params.selected.some((s) => isVehicleEnergyCompatible(s.checkpoint, params.vehicleType));
  if (hasRequiredType) return;

  const fallback = params.candidatesAlongRoute
    .filter((c) => !params.picked.has(c.checkpoint.id))
    .filter((c) => isVehicleEnergyCompatible(c.checkpoint, params.vehicleType))
    .map((c) => ({
      candidate: c,
      score: scoreCheckpoint(c.checkpoint, {
        vehicleType: params.vehicleType,
        needsFuelHere: true,
        preferences: params.preferences
      })
    }))
    .sort((a, b) => b.score - a.score)[0]?.candidate;

  if (!fallback) return;

  const mandatory: RankedCheckpoint = {
    checkpoint: fallback.checkpoint,
    priority: "REQUIRED",
    reasoning:
      params.vehicleType === VehicleType.EV
        ? "⚡ Essential EV charging stop added for route safety."
        : "⛽ Essential fuel stop added for route safety."
  };

  if (params.selected.length < params.maxCheckpoints) {
    params.selected.push(mandatory);
    params.picked.add(fallback.checkpoint.id);
    return;
  }

  const replaceIndex = Math.max(params.selected.length - 1, 0);
  params.selected[replaceIndex] = mandatory;
  params.picked.add(fallback.checkpoint.id);
}
