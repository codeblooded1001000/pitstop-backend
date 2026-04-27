# Pitstop Backend

Backend API for **Pitstop** - "Long drives, broken down beautifully."

## Stack

- NestJS (TypeScript)
- PostgreSQL + PostGIS
- Prisma ORM
- Redis-ready architecture (optional to add cache later)

## Implemented V1

- Delhi -> Jaipur corridor trip planning
- `POST /api/trip/plan` endpoint
- Vehicle and checkpoint modules
- Pure algorithm utilities for:
  - range calculation
  - checkpoint ranking
  - ETA calculation
- Prisma seed script loading data from:
  - `prisma/data/vehicles.json`
  - `prisma/data/checkpoints.json`
- Input validation with `class-validator`
- CORS enabled globally

## Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

3. Run migrations

```bash
npm run prisma:migrate
```

4. Seed data

```bash
npm run prisma:seed
```

5. Start server

```bash
npm run start:dev
```

API runs at `http://localhost:3000` with global prefix `/api`.

## API

### POST `/api/trip/plan`

Request:

```json
{
  "vehicleId": "string",
  "fuelPercent": 60,
  "departureTime": "2026-04-27T08:00:00Z",
  "corridor": "DELHI_JAIPUR"
}
```

Returns trip details, selected checkpoints, ETAs, and a Google Maps deep link.

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
    "distanceFromDelhi": 50,
    "highway": "NH48",
    "corridor": "DELHI_JAIPUR",
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
