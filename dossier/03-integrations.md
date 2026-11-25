# External Integrations Specification: WeatherWatch Pro v6

## 1. External Zero-Auth Integrations Matrix (`INT-1..N`)

| ID | Service | Base URL & Endpoint | Query Params | Timeout | Cache TTL | Fallback Trigger (`[EC-*]`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| INT-1 | BigDataCloud Reverse Geocode | `https://api.bigdatacloud.net/data/reverse-geocode-client` | `latitude={lat}&longitude={lon}&localityLanguage=en` | 3000ms | 86400s | `[EC-2]` Unresolved administrative label defaults to coordinate string; network failure falls back to seeded coordinate dictionary. |
| INT-2 | Open-Meteo Geocoding Search | `https://geocoding-api.open-meteo.com/v1/search` | `name={query}&count=6&language=en&format=json` | 3000ms | 3600s | `[EC-1]` Blank/unresolvable search returns empty matches; retains prior coordinates. |
| INT-3 | Open-Meteo Forecast Engine | `https://api.open-meteo.com/v1/forecast` | `latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto` | 4000ms | 300s | `[EC-3]` Upstream 5xx/timeout activates static baseline dataset for the requested target coordinates. |
| INT-4 | Open-Meteo Historical Archive | `https://archive-api.open-meteo.com/v1/archive` | `latitude={lat}&longitude={lon}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&hourly=temperature_2m&timezone=auto` | 4000ms | 86400s | `[EC-3]`, `[EC-4]` Upstream failure returns deterministic baseline archival metrics; leap-year query shifts strictly by calendar epoch minus 365 days. |

---

## 2. Trimmed Upstream JSON Schemas (Draft 2020-12)

### INT-1: Reverse Geocoding (BigDataCloud)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["latitude", "longitude"],
  "properties": {
    "latitude": { "type": "number" },
    "longitude": { "type": "number" },
    "city": { "type": "string" },
    "locality": { "type": "string" },
    "principalSubdivision": { "type": "string" },
    "countryName": { "type": "string" }
  },
  "additionalProperties": true
}
```

### INT-2: Forward Geocoding Search (Open-Meteo)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "latitude", "longitude", "country"],
        "properties": {
          "id": { "type": "integer" },
          "name": { "type": "string" },
          "latitude": { "type": "number" },
          "longitude": { "type": "number" },
          "country": { "type": "string" },
          "admin1": { "type": "string" }
        }
      }
    }
  }
}
```

### INT-3: Live Forecast & Horizon Projections (Open-Meteo)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["current", "hourly", "daily"],
  "properties": {
    "current": {
      "type": "object",
      "required": ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "weather_code", "wind_speed_10m"],
      "properties": {
        "temperature_2m": { "type": "number" },
        "relative_humidity_2m": { "type": "number" },
        "apparent_temperature": { "type": "number" },
        "weather_code": { "type": "integer" },
        "wind_speed_10m": { "type": "number" }
      }
    },
    "hourly": {
      "type": "object",
      "required": ["time", "temperature_2m", "weather_code"],
      "properties": {
        "time": { "type": "array", "items": { "type": "string" }, "minItems": 24 },
        "temperature_2m": { "type": "array", "items": { "type": "number" }, "minItems": 24 },
        "weather_code": { "type": "array", "items": { "type": "integer" }, "minItems": 24 }
      }
    },
    "daily": {
      "type": "object",
      "required": ["time", "weather_code", "temperature_2m_max", "temperature_2m_min"],
      "properties": {
        "time": { "type": "array", "items": { "type": "string" }, "minItems": 7 },
        "weather_code": { "type": "array", "items": { "type": "integer" }, "minItems": 7 },
        "temperature_2m_max": { "type": "array", "items": { "type": "number" }, "minItems": 7 },
        "temperature_2m_min": { "type": "array", "items": { "type": "number" }, "minItems": 7 }
      }
    }
  }
}
```

### INT-4: Historical Archive Comparison (Open-Meteo)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["hourly"],
  "properties": {
    "hourly": {
      "type": "object",
      "required": ["time", "temperature_2m"],
      "properties": {
        "time": { "type": "array", "items": { "type": "string" } },
        "temperature_2m": { "type": "array", "items": { "type": "number" } }
      }
    }
  }
}
```

---

## 3. Controlled Degradation & Provenance Contract

Internal server endpoints proxying external integrations normalize upstream responses and guarantee constant availability.

- **HTTP Status Guarantee:** Internal proxy routes (`/api/weather`, `/api/history`, `/api/geocode`) return HTTP `200 OK` across both nominal upstream executions and controlled fallbacks.
- **Provenance Flag Contract:** Every internal response payload encapsulates a top-level metadata envelope specifying origin:
  - `"source": "live"`: Data resolved successfully via upstream zero-auth network providers (`INT-1..4`).
  - `"source": "fallback"`: External provider failed (timeout, HTTP 4xx/5xx, unreachable). Data resolved from local seeded cache or default geographic baselines (`[EC-2]`, `[EC-3]`).
- **Data Simulation Prohibition:** If upstream historical or forecast providers fail, metrics are populated strictly from deterministic seeded baseline records (Madrid baseline: 40.4168, -3.7038; Barcelona, Valencia, Sevilla seeds). Dynamic algorithmic simulation (e.g., trigonometric fluctuation via `Math.sin()`) is strictly prohibited.
- **Leap Year Alignment:** For `INT-4`, the 365-day historical offset evaluates target timestamp via `Date.now() - (365 * 86400000)` ms, ensuring ISO date formatting strictly follows absolute elapsed days without date math mutations (`[EC-4]`).