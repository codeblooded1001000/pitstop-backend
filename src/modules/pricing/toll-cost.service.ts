import { Injectable } from "@nestjs/common";
import { Route } from "@prisma/client";

export type TollCostEstimate = {
  amount: number;
  formatted: string;
  subtitle: string;
  highways: string[];
};

@Injectable()
export class TollCostService {
  // Per-km toll rates (rough estimates from FASTag history)
  // NOTE: This is intentionally heuristic. TODO: integrate TollGuru (paid) for accurate toll pricing.
  private readonly RATE_PER_KM: Record<string, number> = {
    NH48: 1.35,
    NH44: 1.2,
    NH8: 1.4,
    NH19: 1.3,
    NH16: 1.25,
    NE3: 2.5,
    NE4: 2.4,
    YEW: 2.3,
    DEFAULT: 1.2
  };

  async estimate(route: Route): Promise<TollCostEstimate> {
    const highways = this.extractHighways(route);
    const distanceKm = route.distanceMeters / 1000;

    // Heuristic: assume ~70% of route is tolled.
    const tolledKm = distanceKm * 0.7;

    const primaryHighway = highways[0] ?? "DEFAULT";
    const rate = this.RATE_PER_KM[primaryHighway] ?? this.RATE_PER_KM.DEFAULT;
    const amount = Math.round(tolledKm * rate);

    return {
      amount,
      formatted: formatINR(amount),
      subtitle: highways.length > 0 ? `${highways.join(", ")} · FASTag` : "FASTag",
      highways
    };
  }

  extractHighways(route: Route): string[] {
    // Parse Directions legs.steps[].html_instructions for highway names.
    // Matches: "NH48", "NH-48", "NE3", "NE-4", "YEW"
    const found = new Set<string>();
    const legs = Array.isArray(route.legs) ? (route.legs as unknown as Array<Record<string, unknown>>) : [];

    for (const leg of legs) {
      const steps = Array.isArray((leg as { steps?: unknown }).steps) ? ((leg as { steps?: unknown }).steps as unknown[]) : [];
      for (const step of steps) {
        const html = typeof (step as { html_instructions?: unknown }).html_instructions === "string"
          ? ((step as { html_instructions?: unknown }).html_instructions as string)
          : "";
        const matches = html.match(/\b(NH|NE)[-\s]?\d{1,3}\b|\bYEW\b/gi);
        if (matches) {
          for (const m of matches) {
            found.add(m.replace(/[-\s]/g, "").toUpperCase());
          }
        }
      }
    }

    return Array.from(found);
  }
}

function formatINR(amount: number): string {
  return `₹ ${amount.toLocaleString("en-IN")}`;
}

