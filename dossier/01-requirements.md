# Requirements Specification: WeatherWatch Pro v6

## 1. Operational Scope
WeatherWatch Pro v6 provides geographic and meteorological intelligence by aggregating live forecasts, reverse-geocoded spatial identifiers, and multi-horizon historical weather archives into synchronized spatial and analytical dashboards.
The system operates as an open-access web application enabling real-time comparative weather evaluation without user authentication or commercial paywalls.

## 2. Actors & User Journeys (`UJ-1..N`)

| ID | Actor | Trigger | Action Sequence | Observable Outcome |
| :--- | :--- | :--- | :--- | :--- |
| UJ-1 | Visitor | Application initial boot | 1. Access root application URL.<br>2. Prompt browser geolocation resolution.<br>3. Fall back deterministically to Madrid coordinates if denied/unavailable.<br>4. Trigger reverse-geocoding for resolved coordinates. | System displays live local metrics and reverse-geocoded city name for detected position or Madrid baseline. |
| UJ-2 | Field Planner | Location exploration via map, search, or presets | 1. Click map canvas, input text into location search bar, or select a quick hub (Madrid, Barcelona, Valencia, Sevilla).<br>2. Update target geographic coordinates.<br>3. Fetch live observations and historical offsets. | Map centers on target coordinate, updates location metadata, and displays current metrics alongside historical deltas. |
| UJ-3 | Route Analyst | Analytical horizon inspection | 1. Toggle interface from Map View to Analysis View.<br>2. Inspect hourly distribution without horizontal scrolling.<br>3. Inspect the comprehensive multi-day forecast sequence. | Interface renders a deterministic 24-hour metric grid and a structured 7-day tabular forecast projection. |

## 3. Functional Requirements (`FR-1..N`)

1. **FR-1: Geolocation and Fallback Resolution:** The system SHALL attempt browser geolocation acquisition on boot, resolve coordinate pairs to named administrative settlements via zero-key reverse geocoding, and default deterministically to Madrid coordinates (40.4168° N, 3.7038° W) whenever coordinate acquisition is denied, timed out, or unavailable.
2. **FR-2: Target Coordinate Acquisition:** The system SHALL accept coordinate inputs via direct map canvas click events, textual location search queries, or dedicated quick-hub selectors (Madrid, Barcelona, Valencia, Sevilla), immediately repositioning the focus coordinate and re-querying associated meteorological pipelines.
3. **FR-3: Live Meteorological Aggregation:** The system SHALL query the Open-Meteo forecast API for target coordinates to extract and display current temperature, apparent ("feels-like") temperature, wind velocity, and relative humidity percentage.
4. **FR-4: Historical Horizon Comparison:** The system SHALL query the Open-Meteo historical archive API for the active coordinate at exact historical offsets of 7 days, 30 days, and 365 days prior to the current date, computing and displaying delta comparison badges against current temperature readings.
5. **FR-5: Analytical Multi-Temporal Projection:** The system SHALL render an Analysis View presenting a 24-hour non-horizontal-scrolling hourly grid alongside an ordered 7-day forecast table displaying projected daily minimums, maximums, and weather conditions derived from the Open-Meteo forecast service.

## 4. Acceptance Criteria (Gherkin)

### Scenario 1: Initial Geolocation Resolution & Fallback [FR-1]
- **Given** an unauthenticated visitor opens the web application
- **When** browser geolocation permissions are denied or fail to respond within timeout thresholds
- **Then** the system sets coordinates to 40.4168° N, 3.7038° W
- **And** the interface displays "Madrid" as the active location title with live weather data.

### Scenario 2: Target Location Selection via Hubs and Map [FR-2, FR-3]
- **Given** the user is viewing the Map View interface
- **When** the user taps the "Barcelona" quick-hub selector or clicks directly on Barcelona coordinates
- **Then** the map view centers on the selected coordinates
- **And** the telemetry cards update to display current temperature, feels-like temperature, wind speed, and humidity for that coordinate.

### Scenario 3: Historical Offset Computation [FR-4]
- **Given** active location coordinates have been established
- **When** the meteorological telemetry completes fetching
- **Then** the interface displays three distinct comparison badges displaying temperature variance against records from 7 days ago, 30 days ago, and 365 days ago.

### Scenario 4: Analytical Grid and Forecast Presentation [FR-5]
- **Given** meteorological telemetry has successfully loaded for a chosen location
- **When** the user toggles from Map View to Analysis View
- **Then** the system displays all 24 consecutive hourly forecasts within a fixed, non-scrolling grid layout
- **And** displays a 7-day tabular forecast containing daily minimum, maximum, and sky condition metrics.

## 5. Edge Cases & Resilience (`EC-1..N`)

- **EC-1:** Text search submission contains empty characters, non-alphanumeric symbols, or unresolvable place names -> The system displays a non-blocking "Location not found" notification, retains the previous valid coordinate state, and prevents map repositioning.
- **EC-2:** Target selection lands on oceanic, polar, or unpopulated terrestrial coordinates where reverse geocoding returns no settlement labels -> The system renders formatted decimal coordinate strings (`Lat: ±XX.XXXX, Lon: ±YY.YYYY`) in place of a municipal name without halting data retrieval.
- **EC-3:** External weather APIs (Open-Meteo forecast or archive) time out, return HTTP 5xx codes, or client is offline -> The system retains the active interface state, displays an unobtrusive "Data Source Offline - Displaying Baseline Cache" banner, and populates metrics with pre-loaded baseline dataset records.
- **EC-4:** Leap year date alignment for the 365-day historical offset check -> The system evaluates the calendar difference deterministically by subtracting exactly 365 days from the active epoch timestamp regardless of leap day boundaries.

## 6. Negative Scope Boundary (`OUT-1..N`)

- **OUT-1:** User account registration, session authentication, cloud settings synchronization, or subscription billing tiers.
- **OUT-2:** Proprietary or commercial weather API integrations requiring paid licensing or proprietary API access tokens.
- **OUT-3:** Custom severe weather push notification engines, SMS dispatchers, or background background-daemon alerting.
- **OUT-4:** Native mobile compilation targets, offline native GPS background tracking, or wearable device integrations.
- **OUT-5:** User weather journaling, crowdsourced citizen-science observation submissions, or social sharing integrations.