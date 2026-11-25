# UX & Interface Design: WeatherWatch Pro v6

## 1. Navigation & Spatial Architecture (ASCII Wireframes — Desktop `1280px` & Mobile `375px`)

### View Topology
WeatherWatch Pro v6 uses **2 dedicated routed views** connected via a global top navigation bar:
- `#/map` — **Map View** (`[UJ-1]`, `[UJ-2]`): Interactive spatial workspace, direct coordinate acquisition, quick-hub presets, and live observation telemetry cards with historical delta badges.
- `#/analysis` — **Analysis View** (`[UJ-3]`): Comparative analytical workspace with a wrap-around 24-hour metric grid and a 7-day tabular forecast projection.

Strict spatial layout: no horizontal scrolling (`scrollWidth <= clientWidth` at `375px` and `1280px`). Multi-column telemetry wraps deterministically.

### Desktop Wireframe (`1280px`)
```text
+----------------------------------------------------------------------------------------------------+
| [Brand: WeatherWatch Pro]    [Nav: #/map (active) | #/analysis]        [My Location (GPS)] [Theme] |
+----------------------------------------------------------------------------------------------------+
| Search Location: [ Enter city name...                ][ Search ]  Hubs: [Madrid][Barcelona][Valencia][Sevilla] |
+-------------------------------------------------------------------+--------------------------------+
| Map Canvas (`#/map`)                                              | Location: Madrid, Spain        |
|                                                                   +--------------------------------+
| [Leaflet Canvas - Full Coordinate Picker]                        | CURRENT CONDITIONS             |
|                                                                   | Temp: 22.4°C | Feels: 21.8°C   |
|                                                                   | Wind: 14 km/h | Hum: 48%       |
|                                                                   +--------------------------------+
|                                                                   | HISTORICAL COMPARISON          |
|                                                                   | [-7d: +1.2°C] [-30d: -2.4°C]   |
|                                                                   | [-365d: +0.8°C]                |
|                                                     [Zoom +/-]    | Status: Baseline Active        |
+-------------------------------------------------------------------+--------------------------------+
```

### Mobile Wireframe (`375px`)
```text
+-----------------------------------+
| [Brand: WW Pro]      [GPS] [Theme]|
+-----------------------------------+
| Nav: [ Map (#/map) | Analysis ]   |
+-----------------------------------+
| [ Enter city name...       ] [Go] |
| Hubs: [MAD] [BCN] [VLC] [SVQ]     |
+-----------------------------------+
| Map Canvas (`#/map`)              |
| [ Interactive Leaflet View ]      |
|                       [Zoom +/-]  |
+-----------------------------------+
| Active: Madrid, Spain             |
+-----------------------------------+
| Temp: 22.4°C   | Feels: 21.8°C    |
| Wind: 14 km/h  | Humidity: 48%    |
+-----------------------------------+
| Historical Offsets:               |
| [-7d: +1.2°C]   [-30d: -2.4°C]    |
| [-365d: +0.8°C]                   |
+-----------------------------------+
```

---

## 2. UI Block Catalog (`UI-1..N`)

### UI-1: Global Application Shell & Nav
- **View:** `Global Shell` | **Traces:** `[FR-1]`, `[FR-2]`, `[UJ-1]`
- **Component Pattern:** Header navigation bar containing single `h1` brand title, semantic view router (`#/map` vs `#/analysis`), "My Location" action button (`crosshair` icon), and contrast theme toggle (`sun`/`moon` icon).
- **Rich Data Visualization & Copy:** Status indicator badge displaying active connection fidelity (`Live Sync` vs `Offline Baseline`).
- **Interactions:** Keyboard navigation with visible focus rings; single primary navigation switch across routes.

### UI-2: Spatial Search & Quick-Hub Dispatcher
- **View:** `#/map` | **Traces:** `[FR-1]`, `[FR-2]`, `[UJ-1]`, `[UJ-2]`
- **Component Pattern:** Input bar with search trigger button (`search` icon) paired with a responsive chip list of 4 preset municipal hubs: Madrid, Barcelona, Valencia, Sevilla.
- **Rich Data Visualization & Copy:** Human-readable settlement label resolved by reverse geocoding with subtitle coordinate metadata (`40.4168° N, 3.7038° W`).
- **Interactions:** Selecting a hub chip updates search text, focus coordinate, and triggers telemetry refresh. `Enter` submits query; `Esc` clears text field.

### UI-3: Spatial Map Viewport
- **View:** `#/map` | **Traces:** `[FR-2]`, `[UJ-2]`
- **Component Pattern:** Responsive map viewport mounted with isolated tile controls at top-right. Marker pin placed at active coordinates.
- **Rich Data Visualization & Copy:** Dynamic marker popup showing active settlement name and current temperature summary.
- **Interactions:** Canvas click re-pins marker, updates target coordinates, and dispatches data reload. Map resizes responsively across view toggles.

### UI-4: Current Telemetry & Historical Horizon Delta Panel
- **View:** `#/map` | **Traces:** `[FR-3]`, `[FR-4]`, `[UJ-1]`, `[UJ-2]`
- **Component Pattern:** Multi-card telemetry cluster (`thermometer`, `wind`, `droplet`, `clock-rotate-left` icons).
- **Rich Data Visualization & Copy:** 
  - Real-time gauges: Temperature (`tabular-nums`, °C), Apparent Temperature (°C), Wind Velocity (`km/h`), Humidity (`%` bar gauge).
  - 3 Historical Offset Delta Badges: 7-day, 30-day, and 365-day comparative offsets with upward/downward semantic indicators (`+X.X°C` in rose, `-X.X°C` in teal).
- **Interactions:** Tap historical badge to highlight historical timestamp and comparison details.

### UI-5: Analytical 24-Hour Metric Grid
- **View:** `#/analysis` | **Traces:** `[FR-5]`, `[UJ-3]`
- **Component Pattern:** Non-scrolling wrapping analytical matrix (4 rows x 6 columns on desktop; 6 rows x 4 columns on mobile).
- **Rich Data Visualization & Copy:** 24 sequential hourly forecast cells containing time label (`HH:00`), dynamic weather condition glyph, and temperature badge with relative thermal bar.
- **Interactions:** Hover/tap cell reveals wind and precipitation probability tooltip without shifting page geometry.

### UI-6: Multi-Day Synoptic Forecast Table
- **View:** `#/analysis` | **Traces:** `[FR-5]`, `[UJ-3]`
- **Component Pattern:** Structured 7-day tabular forecast (`calendar` icon).
- **Rich Data Visualization & Copy:** Table rows detailing Day of Week, Date (`DD MMM`), Condition description badge, Projected Min/Max span with a proportional horizontal gradient track (`tabular-nums`), and Precipitation metric.
- **Interactions:** Accessible table structure (`thead`, `th`, `td`) with full screen-reader label compliance.

---

## 3. 4-State Behavioral Matrix

| UI Block | Loading (Skeleton) | Empty (Icon + CTA) | Error / Degraded (`[EC-*]` Non-blocking Toast) | Success (Hydrated State) |
| :--- | :--- | :--- | :--- | :--- |
| **UI-1: Global Shell** | Subdued pulse on brand badge | Default shell with default Madrid label | `[EC-3]` Toast: "Offline baseline active" with amber status indicator | Full brand title, active route, live sync status badge |
| **UI-2: Search & Hubs** | Shimmer across chip selectors and input field | Empty input with placeholder "Search city name..." | `[EC-1]` Toast: "Location not found. Retaining prior coordinate." | Formatted city label and active hub highlight |
| **UI-3: Map Viewport** | Neutral grid pattern with loading spinner | Centered baseline at Madrid coordinates | `[EC-2]` Unnamed zone fallback: coordinates shown in place of name | Centered tile layer with active pin at target position |
| **UI-4: Telemetry & Historical** | 4 pulsating skeleton metric cards and 3 gray pill badges | "Awaiting coordinates" callout with "Center Map" button | `[EC-3]` Cached baseline metrics loaded with warning badge; `[EC-4]` leap-year delta tagged | Hydrated readings with signed historical variance badges |
| **UI-5: 24h Hourly Grid** | 24 muted wireframe blocks in wrapping layout | "No hourly projection available" with reload action | `[EC-3]` Last-known hourly cache displayed with warning banner | 24 consecutive hourly data cells with icons and metrics |
| **UI-6: 7-Day Forecast** | 7 skeleton rows with gradient placeholders | "No forecast data" banner with retry action | `[EC-3]` Baseline 7-day projection loaded with cache icon | 7 complete forecast rows with min/max spans and condition glyphs |

---

## 4. W3C Visual Tokens & Accessibility Rules

### Design Tokens (HSL Values)

| Token Name | Light Theme (`:root`) | Dark Theme (`.dark`) | Function / Intent |
| :--- | :--- | :--- | :--- |
| `--background` | `hsl(210, 20%, 98%)` | `hsl(222, 47%, 11%)` | Primary page canvas |
| `--foreground` | `hsl(222, 47%, 11%)` | `hsl(210, 20%, 98%)` | Primary typography |
| `--card` | `hsl(0, 0%, 100%)` | `hsl(217, 33%, 17%)` | Panel and metric containers |
| `--primary` | `hsl(201, 96%, 32%)` | `hsl(199, 89%, 48%)` | Interactive actions, active navigation |
| `--muted` | `hsl(210, 20%, 92%)` | `hsl(217, 33%, 24%)` | Secondary backgrounds, inactive chips |
| `--muted-foreground` | `hsl(215, 16%, 47%)` | `hsl(215, 20%, 65%)` | Captions, axis labels, subtitles |
| `--border` | `hsl(214, 32%, 88%)` | `hsl(217, 33%, 28%)` | Structural separators, outlines |
| `--radius` | `0.5rem` | `0.5rem` | Standardized border curve |

### Typography & WCAG 2.1 AA Rules
- **Contrast:** Strict compliance with >= 4.5:1 text-to-background contrast across all token pairs in both Light and Dark themes.
- **Numbers & Telemetry:** `font-variant-numeric: tabular-nums` enforced on all temperatures, historical deltas, percentages, coordinates, and forecast ranges to eliminate layout jitter.
- **Forms & Inputs:** Permanent, visible labels above search fields; no reliance on transient placeholder text.
- **Touch Targets:** All interactive buttons, chips, and table triggers enforce a minimum bounding box of 40x40px with a minimum 8px spacing gutter.
- **Layout Integrity:** Horizontal overflow is strictly prevented (`scrollWidth <= clientWidth` across mobile `375px` and desktop `1280px`). Multi-column grids wrap naturally without horizontal scrolling.