# System Architecture: WeatherWatch Pro v6

## 1. C4 Level-3 Component Topology (ASCII)

```text
+---------------------------------------------------------------------------------------------------------+
| CLIENT TIER (Browser: Zero-Build SPA)                                                                   |
|   +-------------------------------------------------------------------------------------------------+   |
|   | public/index.html (Tailwind CDN + Lucide Icons + Leaflet 1.9.4 CDN)                             |   |
|   | Mounted on: <body x-data="app"> (Alpine.js 3.14.8 CDN)                                          |   |
|   +-------------------------------------------------------------------------------------------------+   |
|   | public/app.js (Alpine.data('app'))                                                              |   |
|   |  - State: activeView ('#/map' | '#/analysis'), coords {lat, lon}, query, liveData, historyDeltas |   |
|   |  - Actions: init(), syncRoute(), searchLocation(), selectHub(), pickMapCoords(), fetchTelemetry() |   |
|   +-------------------------------------------------------------------------------------------------+   |
+---------------------------------------------------+-----------------------------------------------------+
                                                    | JSON / HTTP (fetch)
                                                    v
+---------------------------------------------------+-----------------------------------------------------+
| SERVER TIER (Node.js v24 + Express 5 Chassis)                                                           |
|                                                                                                         |
|   src/index.js (Express Application, Middleware, Static Router, Catch-all Fallback)                    |
|        |                                                                                                |
|        +---> GET /health                                                                                |
|        +---> POST /api/reset (Re-executes data/seed.sql against src/db.js)                              |
|                                                                                                         |
|   src/routes/weather.routes.js                                                                          |
|        |                                                                                                |
|        +---> [Zod Middleware: lat/lon & query parsers]  --(Invalid / EC-1)--> 400 { ok: false, error }  |
|        |                                                                                                |
|        +---> GET /api/weather?latitude=&longitude=        ---> src/services/forecast.service.js         |
|        +---> GET /api/history?latitude=&longitude=        ---> src/services/history.service.js          |
|        +---> GET /api/geocode/reverse?latitude=&longitude= ---> src/services/geocode.service.js          |
|        +---> GET /api/geocode/search?q=                   ---> src/services/geocode.service.js          |
|                                                                     |                                   |
|        +------------------------------------------------------------+                                   |
|        | External Fetches with AbortController (3000-4000ms TTL Cache)                                   |
|        v                                                                                                |
|   +---------------------------------------------------------------------+                               |
|   | External Services: Open-Meteo (INT-2,3,4) & BigDataCloud (INT-1)   |                               |
|   +---------------------------------------------------------------------+                               |
|        | (On Network Timeout / HTTP 5xx / EC-3 Fallback)                                                |
|        v                                                                                                |
|   +---------------------------------------------------------------------+                               |
|   | PERSISTENCE TIER: src/db.js (node:sqlite DatabaseSync)             |                               |
|   |  - Baseline Locations (Madrid, Barcelona, Valencia, Sevilla)        |                               |
|   |  - Seed Telemetry & Historical Offsets Cache                        |                               |
|   |  - Executed via data/seed.sql                                       |                               |
|   +---------------------------------------------------------------------+                               |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Domain Architectural Decisions (MADR: `AD-1..N`)

1. **AD-1: Coordinate-First Single-Source-of-Truth Dispatcher** — Traces: `[FR-1]`, `[FR-2]`, `[UI-2]`, `[UI-3]`
   - **Context:** Geolocation resolution, interactive map clicks, textual search results, and predefined hub chips all update target coordinates asynchronously, risking race conditions and UI telemetry desynchronization.
   - **Decision:** Client architecture routes all spatial selection inputs through a single atomic dispatcher `setTargetCoordinates(lat, lon, labelSource)`. This mutates the internal active coordinate state, updates the Leaflet marker position without map destruction, pushes to the reverse-geocoding queue, and triggers the combined telemetry fetch pipeline.
   - **Consequences / Prevents:** Eliminates race conditions between simultaneous search clicks and map repositioning; ensures `UI-3` marker and `UI-4` telemetry cards remain in exact geographic lockstep.

2. **AD-2: Epoch-Based Constant 365-Day Historical Lookback** — Traces: `[FR-4]`, `[EC-4]`, `[INT-4]`
   - **Context:** Calendar date manipulation via `setFullYear(year - 1)` introduces variable offsets and invalid timestamps during leap years (e.g., February 29 evaluation).
   - **Decision:** The historical service computes the 365-day offset strictly by elapsed milliseconds: `new Date(Date.now() - (365 * 86400000)).toISOString().slice(0, 10)`. The 7-day and 30-day offsets use exact offsets of `7 * 86400000` and `30 * 86400000` ms respectively.
   - **Consequences / Prevents:** Prevents calendar calculation anomalies, invalid date exceptions, and upstream HTTP 400 responses from Open-Meteo Historical Archive API (`[EC-4]`).

3. **AD-3: Transparent Baseline Fallback with Provenance Enveloping** — Traces: `[FR-3]`, `[FR-4]`, `[EC-2]`, `[EC-3]`, `[INT-1..4]`
   - **Context:** Third-party public APIs can throttle, time out, or fail. Simulating metrics dynamically with `Math.random()` or returning 500 errors degrades operator trust and violates runtime mandates.
   - **Decision:** All service requests are wrapped in 3000ms–4000ms `AbortController` timeouts. On failure or unresolvable coordinates, the service retrieves pre-seeded SQLite baseline telemetry matching the nearest seeded hub (defaulting to Madrid) and returns HTTP 200 with metadata envelope `{ "source": "fallback", "degraded": true }`.
   - **Consequences / Prevents:** Prevents unhandled server crashes, eliminates synthetic math simulation, and guarantees `[EC-3]` compliant client warnings without breaking interface hydration.

4. **AD-4: Non-Blocking Coalesced Unnamed Zone Coordinate Labeling** — Traces: `[FR-1]`, `[EC-2]`, `[INT-1]`
   - **Context:** When users click marine, polar, or unpopulated terrestrial coordinates, upstream reverse geocoding returns missing or null city and locality names.
   - **Decision:** If `BigDataCloud` returns empty municipal properties or fails, the geocode service returns a normalized fallback string formatted as `Lat: ±XX.XXXX, Lon: ±YY.YYYY` rather than failing the request.
   - **Consequences / Prevents:** Prevents empty labels, crashes, or aborted telemetry loads when querying non-urban geographic points (`[EC-2]`).

5. **AD-5: Strict Query Coercion & Bounds Validation via Zod** — Traces: `[FR-2]`, `[EC-1]`
   - **Context:** URL query parameters arrive as raw strings; invalid latitude (> 90 / < -90), invalid longitude (> 180 / < -180), or blank search text cause downstream API errors or uncaught exceptions.
   - **Decision:** Express route handlers apply strict Zod schemas with `.transform(Number)` and `.refine()` bounding checks on query strings. Unparseable inputs return immediate `400 { ok: false, error: "..." }`.
   - **Consequences / Prevents:** Blocks SQL injection, prevents malformed upstream queries, satisfies `[EC-1]`, and avoids internal server 500 crashes.

---

## 3. SQLite Data Model & Seed Schema (`src/db.js` & `data/seed.sql`)

### SQLite DDL (`src/db.js` initialization)
```sql
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  admin1 TEXT NOT NULL,
  country TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  is_hub INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weather_baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL,
  temperature REAL NOT NULL,
  apparent_temperature REAL NOT NULL,
  relative_humidity INTEGER NOT NULL,
  wind_speed REAL NOT NULL,
  weather_code INTEGER NOT NULL,
  history_7d_temp REAL NOT NULL,
  history_30d_temp REAL NOT NULL,
  history_365d_temp REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hourly_baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL,
  hour_offset INTEGER NOT NULL, -- 0 to 23
  temperature REAL NOT NULL,
  weather_code INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
  UNIQUE(location_id, hour_offset)
);

CREATE TABLE IF NOT EXISTS daily_baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL,
  day_offset INTEGER NOT NULL, -- 0 to 6
  temp_min REAL NOT NULL,
  temp_max REAL NOT NULL,
  weather_code INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
  UNIQUE(location_id, day_offset)
);

CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_locations_slug ON locations(slug);
```

### Realistic Seed Data (`data/seed.sql`)
```sql
DELETE FROM daily_baselines;
DELETE FROM hourly_baselines;
DELETE FROM weather_baselines;
DELETE FROM locations;

-- Hub Locations
INSERT INTO locations (id, slug, name, admin1, country, latitude, longitude, is_hub) VALUES
(1, 'madrid', 'Madrid', 'Comunidad de Madrid', 'Spain', 40.4168, -3.7038, 1),
(2, 'barcelona', 'Barcelona', 'Catalonia', 'Spain', 41.3851, 2.1734, 1),
(3, 'valencia', 'Valencia', 'Valencian Community', 'Spain', 39.4699, -0.3763, 1),
(4, 'sevilla', 'Sevilla', 'Andalusia', 'Spain', 37.3891, -5.9845, 1);

-- Telemetry Baseline & Historical Records
INSERT INTO weather_baselines (location_id, temperature, apparent_temperature, relative_humidity, wind_speed, weather_code, history_7d_temp, history_30d_temp, history_365d_temp) VALUES
(1, 22.4, 21.8, 48, 14.2, 1, 21.2, 24.8, 21.6),
(2, 24.1, 24.6, 62, 18.0, 2, 23.0, 26.5, 23.2),
(3, 25.3, 26.0, 58, 12.5, 0, 24.1, 27.2, 24.5),
(4, 28.6, 29.2, 38, 9.8, 0, 27.0, 31.0, 27.8);

-- Madrid 24h Hourly Baseline (Sample representative subset across 24h)
INSERT INTO hourly_baselines (location_id, hour_offset, temperature, weather_code) VALUES
(1, 0, 16.5, 0), (1, 1, 15.9, 0), (1, 2, 15.2, 0), (1, 3, 14.8, 0),
(1, 4, 14.3, 0), (1, 5, 14.0, 1), (1, 6, 14.5, 1), (1, 7, 15.8, 1),
(1, 8, 17.4, 1), (1, 9, 19.1, 1), (1, 10, 20.8, 2), (1, 11, 21.9, 2),
(1, 12, 22.4, 2), (1, 13, 23.0, 2), (1, 14, 23.2, 1), (1, 15, 22.9, 1),
(1, 16, 22.1, 1), (1, 17, 21.0, 1), (1, 18, 19.8, 0), (1, 19, 18.7, 0),
(1, 20, 17.9, 0), (1, 21, 17.4, 0), (1, 22, 17.0, 0), (1, 23, 16.6, 0);

-- Madrid 7-Day Synoptic Baseline
INSERT INTO daily_baselines (location_id, day_offset, temp_min, temp_max, weather_code) VALUES
(1, 0, 14.0, 23.2, 1),
(1, 1, 13.8, 24.0, 0),
(1, 2, 14.5, 22.5, 2),
(1, 3, 15.0, 21.0, 3),
(1, 4, 13.2, 20.5, 61),
(1, 5, 12.8, 22.0, 1),
(1, 6, 13.5, 23.5, 0);
```

---

## 4. Internal REST & Zod Validation Contracts

### 4.1 System Endpoints

#### `GET /health`
- **Purpose:** Chassis runtime availability probe.
- **Request:** Empty.
- **Response:** `200 { "status": "online", "ok": true }`

#### `POST /api/reset`
- **Purpose:** Re-seed synchronous in-memory or persisted SQLite tables cleanly from `data/seed.sql`.
- **Request:** Empty body.
- **Response:** `200 { "ok": true, "message": "Database reset to baseline seeds." }`

---

### 4.2 Domain Endpoints (`/api/...`)

#### `GET /api/weather`
- **Purpose:** Powers `[UI-4]`, `[UI-5]`, and `[UI-6]`. Aggregates live observations, 24h hourly sequence, and 7-day daily forecast.
- **Zod Query Schema:**
  ```javascript
  const weatherQuerySchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180)
  });
  ```
- **Error Response (`[EC-1]`):** `400 { "ok": false, "error": "Invalid latitude or longitude coordinates." }`
- **Success Response (`200 OK`):**
  ```json
  {
    "ok": true,
    "source": "live",
    "data": {
      "current": {
        "temperature": 22.4,
        "apparent_temperature": 21.8,
        "relative_humidity": 48,
        "wind_speed": 14.2,
        "weather_code": 1
      },
      "hourly": [
        { "time": "2025-05-18T00:00", "temperature": 16.5, "weather_code": 0 }
      ],
      "daily": [
        { "date": "2025-05-18", "temp_min": 14.0, "temp_max": 23.2, "weather_code": 1 }
      ]
    }
  }
  ```

#### `GET /api/history`
- **Purpose:** Powers `[UI-4]` historical offset badges (-7d, -30d, -365d).
- **Zod Query Schema:**
  ```javascript
  const historyQuerySchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180)
  });
  ```
- **Error Response (`[EC-1]`):** `400 { "ok": false, "error": "Invalid latitude or longitude coordinates." }`
- **Success Response (`200 OK`):**
  ```json
  {
    "ok": true,
    "source": "live",
    "data": {
      "offset_7d": { "date": "2025-05-11", "temperature": 21.2, "delta": 1.2 },
      "offset_30d": { "date": "2025-04-18", "temperature": 24.8, "delta": -2.4 },
      "offset_365d": { "date": "2024-05-18", "temperature": 21.6, "delta": 0.8 }
    }
  }
  ```

#### `GET /api/geocode/reverse`
- **Purpose:** Powers `[UI-2]` and `[UI-3]` marker title resolution.
- **Zod Query Schema:**
  ```javascript
  const reverseGeocodeQuerySchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180)
  });
  ```
- **Error Response (`[EC-1]`):** `400 { "ok": false, "error": "Invalid coordinates for reverse geocoding." }`
- **Success Response (`200 OK`):**
  ```json
  {
    "ok": true,
    "source": "live",
    "data": {
      "name": "Madrid",
      "admin1": "Comunidad de Madrid",
      "country": "Spain",
      "formatted": "Madrid, Comunidad de Madrid, Spain",
      "latitude": 40.4168,
      "longitude": -3.7038
    }
  }
  ```

#### `GET /api/geocode/search`
- **Purpose:** Powers `[UI-2]` text search auto-resolution.
- **Zod Query Schema:**
  ```javascript
  const searchQuerySchema = z.object({
    q: z.string().trim().min(1, "Search query cannot be empty").max(100)
  });
  ```
- **Error Response (`[EC-1]`):** `400 { "ok": false, "error": "Search query cannot be empty" }`
- **Success Response (`200 OK`):**
  ```json
  {
    "ok": true,
    "source": "live",
    "results": [
      {
        "id": 3117735,
        "name": "Madrid",
        "admin1": "Madrid",
        "country": "Spain",
        "latitude": 40.4168,
        "longitude": -3.7038
      }
    ]
  }
  ```

---

## 5. Closed Target File Tree

```text
weatherwatch-pro-v6/
├── package.json
├── data/
│   └── seed.sql
├── public/
│   ├── index.html
│   └── app.js
├── src/
│   ├── index.js
│   ├── db.js
│   ├── routes/
│   │   └── weather.routes.js
│   └── services/
│       ├── forecast.service.js
│       ├── history.service.js
│       └── geocode.service.js
└── tests/
    └── poc.test.js