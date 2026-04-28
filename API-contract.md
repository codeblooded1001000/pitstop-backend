# Pitstop API Integration Contract

This document describes how the frontend currently integrates with backend APIs, including:

- Endpoint and HTTP method
- Request payload/query
- Response shape expected by frontend
- Any mapping/transformation done in `lib/api.ts`

Source of truth in frontend:

- `lib/api.ts`
- `lib/types.ts`
- `lib/hooks/use-place-search.ts`
- `lib/hooks/use-geolocation.ts`
- `lib/hooks/use-trip-estimate.ts`

---

## Base URL

- Frontend uses `NEXT_PUBLIC_API_URL`
- Final URL format: `${NEXT_PUBLIC_API_URL}<endpoint>`
- All requests use `cache: "no-store"`

---

## 1) Vehicles

### GET `/api/vehicles`

#### Frontend call
- `getVehicles()`

#### Expected response (consumed directly)
```json
[
  {
    "id": "string",
    "name": "string",
    "type": "PETROL | DIESEL | CNG | EV",
    "realWorldRange": 500,
    "thumbnailUrl": "optional string"
  }
]
```

#### Frontend type
- `Vehicle[]`

---

## 2) Place Autocomplete

### POST `/api/places/autocomplete`

#### Frontend call
- `autocompletePlace(input, sessionToken)`

#### Request body sent
```json
{
  "input": "Safdar",
  "sessionToken": "uuid-string"
}
```

#### Backend response accepted (2 formats)

##### Format A (already normalized)
```json
[
  {
    "placeId": "string",
    "description": "string",
    "mainText": "string",
    "secondaryText": "string"
  }
]
```

##### Format B (current backend style)
```json
{
  "predictions": [
    {
      "placeId": "string",
      "description": "Akhiyana, Gujarat, India"
    }
  ]
}
```

#### Frontend mapping logic
When Format B is received, frontend maps each item to:

- `placeId` -> `placeId`
- `description` -> `description`
- `mainText` -> first comma-separated part
- `secondaryText` -> remaining comma-separated text

Example:
- `"Akhiyana, Gujarat, India"` ->
  - `mainText: "Akhiyana"`
  - `secondaryText: "Gujarat, India"`

#### Frontend type returned to UI
- `PlaceAutocompleteResult[]`

---

## 3) Place Geocode (PlaceId -> coordinates)

### POST `/api/places/geocode`

#### Frontend call
- `geocodePlace(placeId)`

#### Request body sent
```json
{
  "placeId": "string"
}
```

#### Expected response (consumed directly)
```json
{
  "placeId": "string",
  "name": "string",
  "lat": 28.6139,
  "lng": 77.209,
  "formattedAddress": "string"
}
```

#### Frontend type
- `GeocodedPlace`

---

## 4) Reverse Geocode (Current location)

### POST `/api/places/reverse-geocode`

#### Frontend call
- `reverseGeocode(lat, lng)`

#### Request body sent
```json
{
  "lat": 28.5655739,
  "lng": 77.1959568
}
```

#### Backend response expected (raw)
```json
{
  "place": {
    "lat": 28.5655739,
    "lng": 77.1959568,
    "displayName": "full address",
    "shortName": "Safdarjung Enclave",
    "providerPlaceId": "244171468"
  }
}
```

#### Frontend mapping to `GeocodedPlace`
- `placeId` <- `providerPlaceId` (fallback: `"lat,lng"`)
- `name` <- `shortName` (fallback: `displayName`, then `"Current location"`)
- `lat` <- `place.lat`
- `lng` <- `place.lng`
- `formattedAddress` <- `displayName` (fallback: `shortName`)

#### Frontend type returned to UI
- `GeocodedPlace`

---

## 5) Trip Estimate

### POST `/api/trip/estimate`

#### Frontend call
- `estimateTrip(payload)`
- Triggered from `useTripEstimate()`

#### Request body sent (exact shape)
```json
{
  "origin": {
    "lat": 28.5656049,
    "lng": 77.1958204,
    "name": "Safdarjung Enclave"
  },
  "destination": {
    "lat": 28.7112277,
    "lng": 77.0871039,
    "name": "Destination Name"
  },
  "vehicleId": "cmohdtqvh00037zbm5brfd306",
  "fuelPercent": 70,
  "departureTime": "2026-04-28T10:15:01.125Z"
}
```

#### Expected response
```json
{
  "summary": {
    "driveTimeFormatted": "5h 30m",
    "totalDistanceKm": 270,
    "highway": "NH48",
    "fuelCost": { "formatted": "₹1,450", "subtitle": "approx" },
    "tollCost": { "formatted": "₹320", "subtitle": "approx" },
    "breakTime": { "formatted": "35m", "subtitle": "recommended" },
    "encodedPolyline": "optional polyline string"
  },
  "error": "optional message",
  "errorCode": "TRIP_TOO_SHORT | NO_ROUTE"
}
```

#### Frontend type
- `TripEstimateResponse`

---

## 6) Trip Plan

### POST `/api/trip/plan`

#### Frontend call
- `planTrip(payload)`

#### Request body sent
```json
{
  "origin": { "lat": 28.56, "lng": 77.19, "name": "Origin" },
  "destination": { "lat": 28.71, "lng": 77.08, "name": "Destination" },
  "vehicleId": "string",
  "fuelPercent": 70,
  "departureTime": "ISO string"
}
```

#### Expected response
```json
{
  "id": "trip-plan-id",
  "trip": {
    "origin": { "name": "Origin", "lat": 28.56, "lng": 77.19 },
    "destination": { "name": "Destination", "lat": 28.71, "lng": 77.08 },
    "totalDistanceKm": 270,
    "totalDuration": "5h 30m",
    "encodedPolyline": "polyline-string",
    "googleMapsUrl": "https://maps.google.com/..."
  },
  "checkpoints": [
    {
      "id": "cp_1",
      "name": "Checkpoint",
      "type": "origin | fuel | food | rest | ev | destination",
      "lat": 28.6,
      "lng": 77.2,
      "distanceFromOriginKm": 0,
      "eta": "09:15 AM",
      "duration": 20,
      "note": "optional",
      "reasoning": "optional"
    }
  ]
}
```

#### Frontend type
- `TripPlanResponse`

---

## 7) Get Trip Plan by ID

### GET `/api/trip/:id`

#### Frontend call
- `getTripPlan(id)`

#### Expected response
- Same as `TripPlanResponse` above.

---

## 8) Add Checkpoint

### POST `/api/trip/:tripId/add-checkpoint`

#### Frontend call
- `addCheckpoint(tripId, checkpoint)`

#### Request body sent
```json
{
  "type": "fuel | food | rest | ev | origin | destination",
  "afterCheckpointId": "string",
  "lat": 28.6,
  "lng": 77.2,
  "name": "Checkpoint name"
}
```

#### Expected response
- Full updated `TripPlanResponse`

---

## 9) Remove Checkpoint

### POST `/api/trip/:tripId/remove-checkpoint`

#### Frontend call
- `removeCheckpoint(tripId, checkpointId)`

#### Request body sent
```json
{
  "checkpointId": "string"
}
```

#### Expected response
- Full updated `TripPlanResponse`

---

## 10) Nearby Checkpoints

### GET `/api/trip/:tripId/nearby-checkpoints`

#### Frontend call
- `getNearbyCheckpoints(tripId)`

#### Expected response
```json
{
  "available": [
    {
      "id": "string",
      "name": "string",
      "fullAddress": "string",
      "type": "origin | fuel | food | rest | ev | destination",
      "lat": 28.6,
      "lng": 77.2,
      "note": "optional",
      "duration": 15,
      "distanceFromOriginKm": 128.4,
      "distanceFromRouteMeters": 230
    }
  ]
}
```

#### Frontend type
- `NearbyCheckpoint[]`

---

## 11) Checkpoint Feedback

### POST `/api/feedback/checkpoint`

#### Frontend call
- `submitCheckpointFeedback(payload)`

#### Request body sent
```json
{
  "checkpointId": "string",
  "reason": "string",
  "comment": "optional"
}
```

#### Expected response
- No body required (`void` / `200 OK`)

---

## Current Mapping Summary (Important)

These are the only places frontend transforms backend response:

1. **Autocomplete**
   - Supports both normalized array and `{ predictions: [...] }`.
2. **Reverse geocode**
   - Converts `{ place: ... }` into `GeocodedPlace`.

Everything else is currently consumed as-is according to `lib/types.ts`.

