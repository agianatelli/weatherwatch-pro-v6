# AGENTS.md — WeatherWatch Pro v6

> **Target Deliverable Archetype:** Fullstack Web Application (`fullstack`) | **Port:** `process.env.PORT || 4000` | **Chassis:** Zero-Build v2 | **Authoring:** Proton AI Factory v2

## 0. Canonical Specification Dossier (`dossier/`)
All domain requirements, visual tokens, API schemas, architectural decisions, and acceptance tests live in `dossier/`:
- `dossier/01-requirements.md` — Functional Requirements (`FR-*`), User Journeys (`UJ-*`), Edge Cases (`EC-*`) & Negative Scope (`OUT-*`).
- `dossier/02-ux-design.md` — Navigation & Spatial Wireframes, UI Blocks (`UI-*`), 4-State Matrix & W3C HSL Theme Tokens.
- `dossier/03-integrations.md` — *(Optional)* Verified External Zero-Auth API Contracts & Fallback Rules (`INT-*`).
- `dossier/04-architecture.md` — C4 Level-3 Topology, Domain MADRs (`AD-*`), SQLite DDL, Zod/REST Contracts & Target File Tree.
- `dossier/05-build-plan.md` — Topological Execution Plan & Requirements Traceability Matrix (`SCAFFOLD`, `STORY-1..N`).
- `dossier/06-uat-certification.md` — Live ISTQB / IEEE 29119-3 UAT Certification Report.

## 1. Runtime, Validation & Persistence Contract (Zero-Build v2)
1. **Server & Health (Express 5):** Express (CommonJS) on `process.env.PORT || 4000`, serving `public/` statically and `GET /health` returning `200 { status: 'online', ok: true }`. For SPA/404 fallback, use `app.use((req, res) => ...)` — NEVER use `app.get('*', ...)` (Express 5 throws `PathError` on `*`).
2. **Input Validation (`zod`):** Validate every `POST`/`PUT`/`PATCH` body and critical query parameter using `const { z } = require('zod');`, returning `400 { ok: false, error: '...' }` on invalid/empty payloads (`EC-*`) instead of `500`.
3. **Hybrid SQLite Persistence (`node:sqlite`):** Use `const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.DB_PATH || ':memory:');`. Seed synchronously from `data/seed.sql` on boot when tables are empty, and expose `POST /api/reset` to re-seed cleanly. Zero C++ dependencies (`better-sqlite3` forbidden).
4. **Resilient External APIs & Anti-Simulation:** Encapsulate external calls in `src/services/*.js` with `AbortController` timeouts and TTL cache, falling back transparently to seeded SQLite records offline. NEVER fake domain metrics with `Math.sin()` or `Math.random()`.
5. **Scripts & Packages:** `package.json` uses ONLY `express`, `cors`, `zod`, and Node v24 built-ins, with `"scripts": { "poc": "node src/index.js", "start": "node src/index.js", "test": "node --test" }`.

## 2. Archetype Rules
=== ARCHETYPE: FULLSTACK WEB APPLICATION (ZERO-BUILD v2) ===
1. REACTIVE DECLARATIVE FRONTEND (public/index.html & public/app.js ONLY):
   - Keep ALL frontend HTML in `public/index.html` and ALL client state/methods in ONE `public/app.js` registering `document.addEventListener('alpine:init', () => { Alpine.data('app', () => ({ ... })); });`. Do NOT split JS into `public/js/*.js` sub-files.
   - Load CDNs in `<head>` in exact order:
     1) Tailwind CSS CDN configured with `tailwind.config = { darkMode: 'class', theme: { extend: { colors: { background: 'hsl(var(--background))', foreground: 'hsl(var(--foreground))', card: 'hsl(var(--card))', primary: 'hsl(var(--primary))', muted: 'hsl(var(--muted))', 'muted-foreground': 'hsl(var(--muted-foreground))', border: 'hsl(var(--border))' } } } }`.
     2) Lucide Icons CDN (`<script src="https://unpkg.com/lucide@latest"></script>`) using `<i data-lucide="icon-name" class="w-4 h-4"></i>` and calling `if (window.lucide) window.lucide.createIcons();` on init/updates (use inline geometric `<svg>` ONLY for brand logo + data-URI favicon; zero external PNG/JPG/WebP assets).
     3) `<script defer src="/app.js"></script>` BEFORE `<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>`.
   - DECLARATIVE BINDINGS (ZERO innerHTML SPAGHETTI): Mount `<body x-data="app">` and include `[x-cloak] { display: none !important; }` in `<style>`. Render lists, tabs, modals, and badges declaratively via `x-for`, `x-show`, `x-cloak`, `x-text`, `x-model`, `@click`, and `@keydown.escape.window`. NEVER concatenate HTML strings with `innerHTML` for domain views.
   - SEMANTIC THEME TOKENS (W3C / shadcn-style): Define `:root` (Light default) and `.dark` HSL CSS variables in `<style>` matching `dossier/02-ux-design.md`. Include `#theme-toggle` (☀️ / 🌙) in the top navbar persisting in `localStorage`.
2. APP SHELL, NAVIGATION, 4 MANDATORY STATES & ERGONOMICS:
   - Function-Driven Navigation & Spatial Layout: Match `dossier/02-ux-design.md` View Topology & Wireframes without forcing a single-screen dashboard when distinct workflows exist:
     * If `02-ux-design.md` defines **multiple views** (`#/...`): render semantic `<nav>` links (`<a href="#/view-name">`), sync `activeView` in `public/app.js` with `window.location.hash` + `window.addEventListener('hashchange', ...)` (supporting browser Back/Forward and direct reload, marking active link with `aria-current="page"`), and isolate each view in its own `<section x-show="activeView === 'view-name'" x-cloak>`.
     * If `02-ux-design.md` defines **1 focal view**: render that focused workspace cleanly without unnecessary navigation chrome.
     * Enforce zero horizontal scrollbars (`scrollWidth <= clientWidth` on `375px` mobile and `1280px` desktop; NEVER use horizontal `overflow-x-auto` strips for multi-item series — use wrapping grids or segmented tabs).
   - 4 Explicit Connected States: Declaratively wire **Loading** (`x-show="loading"` skeletons), **Empty** (`x-show="!loading && items.length === 0"` with Lucide icon + CTA), **Error** (`x-show="error"` non-blocking Tailwind toast, NEVER `alert()`, `confirm()`, or `prompt()`), and **Success** (`x-cloak` on modals/popovers, hidden by default).
   - Data & Accessibility Rigor: `tabular-nums` on all numbers/metrics, dynamic data-driven bar widths (NEVER hardcode static `style="width: 40%"`) with visible scale/units, WCAG 2.1 AA contrast, `focus-visible:ring-2`, `min-h-10 min-w-10` targets, visible `<label>` above every input, human-first copy (zero "SQLite"/"In-Memory DB" jargon), and Demo Reset button (`POST /api/reset`).

## 3. Quality & Testing Mandate
- **Complete Files Only:** Output full files in ```filepath:relative/path``` blocks. Zero placeholders (`// TODO`, `// ... existing code`).
- **Unified E2E Test:** Do NOT create per-story test files in intermediate steps. The final step outputs ONE unified `tests/poc.test.js` using `node:test` + `node:assert` querying `http://127.0.0.1:4000` via `fetch()` (covering both `FR-*` happy paths and `EC-*` `400` edge cases; never call `app.listen(4000)` inside tests).
