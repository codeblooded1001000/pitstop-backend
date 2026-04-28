import { Checkpoint, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { decodeEncodedPolyline, polylineToWktLineString } from "./polyline";

export type CheckpointAlongRoute = {
  checkpoint: Pick<
    Checkpoint,
    | "id"
    | "googlePlaceId"
    | "name"
    | "fullAddress"
    | "type"
    | "latitude"
    | "longitude"
    | "rating"
    | "reviewCount"
    | "hasFuel"
    | "hasEVCharger"
    | "hasFood"
    | "hasCleanRestroom"
    | "hasParking"
    | "isFamilyFriendly"
    | "lastVerifiedAt"
    | "suggestedStopDuration"
    | "source"
  >;
  distanceFromRouteMeters: number;
  fractionAlongRoute: number; // 0..1
};

type AlongRouteRow = {
  id: string;
  googlePlaceId: string | null;
  name: string;
  fullAddress: string | null;
  type: Prisma.JsonValue;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviewCount: number | null;
  hasFuel: boolean;
  hasEVCharger: boolean;
  hasFood: boolean;
  hasCleanRestroom: boolean;
  hasParking: boolean;
  isFamilyFriendly: boolean;
  lastVerifiedAt: Date;
  suggestedStopDuration: number;
  source: string;
  distance_from_route_m: number;
  fraction_along_route: number;
};

export async function findCheckpointsAlongRoute(params: {
  prisma: PrismaService;
  encodedPolyline: string;
  radiusMeters: number;
}): Promise<CheckpointAlongRoute[]> {
  const points = decodeEncodedPolyline(params.encodedPolyline);
  if (points.length < 2) return [];

  const wkt = polylineToWktLineString(points);

  const rows = (await params.prisma.$queryRaw<AlongRouteRow[]>`
    WITH route AS (
      SELECT ST_SetSRID(ST_GeomFromText(${wkt}), 4326) AS geom
    )
    SELECT
      c."id",
      c."googlePlaceId",
      c."name",
      c."fullAddress",
      to_jsonb(c."type") AS "type",
      c."latitude",
      c."longitude",
      c."rating",
      c."reviewCount",
      c."hasFuel",
      c."hasEVCharger",
      c."hasFood",
      c."hasCleanRestroom",
      c."hasParking",
      c."isFamilyFriendly",
      c."lastVerifiedAt",
      c."suggestedStopDuration",
      c."source",
      ST_Distance(
        ST_SetSRID(ST_MakePoint(c."longitude", c."latitude"), 4326)::geography,
        (SELECT geom FROM route)::geography
      ) AS "distance_from_route_m",
      ST_LineLocatePoint(
        (SELECT geom FROM route),
        ST_SetSRID(ST_MakePoint(c."longitude", c."latitude"), 4326)
      ) AS "fraction_along_route"
    FROM "Checkpoint" c
    WHERE c."isActive" = true
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(c."longitude", c."latitude"), 4326)::geography,
        (SELECT geom FROM route)::geography,
        ${params.radiusMeters}
      )
    ORDER BY "fraction_along_route" ASC
  `) as AlongRouteRow[];

  return rows
    .map((row) => {
      const types = row.type;
      const typeArray = Array.isArray(types) ? (types as unknown as Checkpoint["type"]) : [];

      return {
        checkpoint: {
          id: row.id,
          googlePlaceId: row.googlePlaceId,
          name: row.name,
          fullAddress: row.fullAddress,
          type: typeArray,
          latitude: row.latitude,
          longitude: row.longitude,
          rating: row.rating,
          reviewCount: row.reviewCount,
          hasFuel: row.hasFuel,
          hasEVCharger: row.hasEVCharger,
          hasFood: row.hasFood,
          hasCleanRestroom: row.hasCleanRestroom,
          hasParking: row.hasParking,
          isFamilyFriendly: row.isFamilyFriendly,
          lastVerifiedAt: row.lastVerifiedAt,
          suggestedStopDuration: row.suggestedStopDuration,
          source: row.source
        },
        distanceFromRouteMeters: Number(row.distance_from_route_m),
        fractionAlongRoute: Number(row.fraction_along_route)
      };
    })
    .filter((item) => Number.isFinite(item.fractionAlongRoute) && item.fractionAlongRoute >= 0 && item.fractionAlongRoute <= 1);
}

