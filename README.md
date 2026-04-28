# Pitstop Backend

Backend API for **Pitstop** - "Long drives, broken down beautifully."

## Stack

- NestJS (TypeScript)
- PostgreSQL + PostGIS (required for v2 route buffering)
- Prisma ORM
- Redis (caching + BullMQ)
- Google Maps Platform APIs (Geocoding, Directions, Places)

## Implemented V2 (current)

- Any origin → any destination trip planning via Google Directions
- Route caching in DB (`Route`) with TTL
- Checkpoints filtered within 5km of route polyline (PostGIS)
- Checkpoint selection + ETA calculation utilities
- Editable trip plans (`TripPlan`) with add/remove checkpoint endpoints
- Background POI ingestion job (BullMQ) to upsert checkpoints from Google Places
- Places helpers: geocode + autocomplete (cached)
- Feedback endpoint for checkpoint flagging
- CORS enabled globally, validation via `class-validator`

## Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

3. Ensure PostGIS is available, then enable it

Your Postgres must have PostGIS installed. Then run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

4. Run migrations

```bash
npm run prisma:migrate
```

5. Seed data (vehicles + curated manual checkpoints)

```bash
npm run prisma:seed
```

6. Start server

```bash
npm run start:dev
```

API runs at `http://localhost:3000` with global prefix `/api`.

## API

### POST `/api/trip/estimate`

Lightweight "Trip at a Glance" estimate. Does **not** create a `TripPlan`.

```bash
curl -X POST "http://localhost:3000/api/trip/estimate" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": { "lat": 28.6139, "lng": 77.2090, "address": "Connaught Place, New Delhi" },
    "destination": { "address": "Jaipur, Rajasthan" },
    "vehicleId": "YOUR_VEHICLE_ID",
    "fuelPercent": 80,
    "departureTime": "2026-04-28T06:00:00Z"
  }'
```

### POST `/api/trip/plan`

Request:

```json
{
  "origin": { "lat": 28.6139, "lng": 77.2090, "address": "Connaught Place, New Delhi" },
  "destination": { "address": "Jaipur, Rajasthan" },
  "vehicleId": "clx123...",
  "fuelPercent": 60,
  "departureTime": "2026-04-28T08:00:00Z",
  "preferences": { "maxCheckpoints": 5, "prioritize": ["FOOD", "FUEL"] }
}
```

Returns a persisted trip plan (id), route polyline, checkpoints, ETAs, and a Google Maps deep link.

### POST `/api/trip/:tripPlanId/add-checkpoint`

```json
{ "checkpointId": "clx999..." }
```

### POST `/api/trip/:tripPlanId/remove-checkpoint`

```json
{ "checkpointId": "clx999..." }
```

### GET `/api/trip/:tripPlanId/nearby-checkpoints`

Returns checkpoints along the cached route not currently selected.

### POST `/api/places/geocode`

```json
{ "address": "Karol Bagh, New Delhi" }
```

### POST `/api/places/autocomplete`

```json
{ "input": "Jaip", "sessionToken": "uuid-from-frontend" }
```

### POST `/api/admin/fetch-pois`

```json
{ "encodedPolyline": "..." }
```

### POST `/api/feedback/checkpoint`

```json
{ "checkpointId": "clx111...", "reason": "WRONG_LOCATION", "comment": "Moved to the other side of the highway" }
```

### POST `/api/admin/fuel-price`

Creates a DB override so you can update prices without redeploying.

```bash
curl -X POST "http://localhost:3000/api/admin/fuel-price" \
  -H "Content-Type: application/json" \
  -d '{
    "fuelType": "PETROL",
    "region": "INDIA_AVG",
    "pricePerUnit": 95,
    "unit": "LITER",
    "source": "manual",
    "expiresAt": "2026-05-28T00:00:00Z"
  }'
```

## Seed Data Format

`prisma/data/vehicles.json`

```json
[
  {
    "name": "Hyundai Creta",
    "brand": "Hyundai",
    "type": "PETROL",
    "tankCapacity": 50,
    "batteryCapacity": null,
    "realWorldRange": 420,
    "imageUrl": null,
    "popularityRank": 1
  }
]
```

`prisma/data/checkpoints.json`

```json
[
  {
    "name": "Murthal - Amrik Sukhdev Dhaba",
    "type": ["DHABA", "FUEL"],
    "latitude": 29.04,
    "longitude": 77.06,
    "rating": 4.4,
    "reviewCount": 12000,
    "hasFuel": true,
    "hasEVCharger": false,
    "evChargerType": null,
    "hasFood": true,
    "hasCleanRestroom": true,
    "hasParking": true,
    "isFamilyFriendly": true,
    "description": "Famous for paranthas.",
    "highlights": ["Paranthas", "Clean washrooms", "Large parking"],
    "imageUrl": null
  }
]
```
