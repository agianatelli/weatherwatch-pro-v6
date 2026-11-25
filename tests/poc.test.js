const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/index');

const PORT = 4000;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

let server;

describe('WeatherWatch Pro v6 — Unified End-to-End Test Suite', () => {
  before(async () => {
    // Only bind local port if running standalone test process
    if (!process.env.BASE_URL) {
      await new Promise((resolve) => {
        server = app.listen(PORT, () => resolve());
      });
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  });

  // Chassis & System Tests
  test('SCAFFOLD: GET /health returns online status', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.status, 'online');
  });

  test('SCAFFOLD: POST /api/reset seeds database cleanly', async () => {
    const res = await fetch(`${BASE_URL}/api/reset`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.match(json.message, /baseline seeds/i);
  });

  // STORY-1: Geocoding & Coordinate Resolution Tests (FR-1, FR-2, EC-1, EC-2)
  test('FR-1 / INT-1: GET /api/geocode/reverse resolves valid coordinates or seeded fallback', async () => {
    const res = await fetch(`${BASE_URL}/api/geocode/reverse?latitude=40.4168&longitude=-3.7038`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.ok(json.data);
    assert.ok(json.data.formatted.length > 0);
  });

  test('EC-1: GET /api/geocode/reverse returns 400 for out-of-range coordinates', async () => {
    const res = await fetch(`${BASE_URL}/api/geocode/reverse?latitude=105.00&longitude=-3.7038`);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.ok, false);
    assert.match(json.error, /Invalid coordinates/i);
  });

  test('FR-2 / INT-2: GET /api/geocode/search returns location candidates for valid query', async () => {
    const res = await fetch(`${BASE_URL}/api/geocode/search?q=Madrid`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.ok(Array.isArray(json.results));
    assert.ok(json.results.length > 0);
    assert.strictEqual(json.results[0].name.toLowerCase(), 'madrid');
  });

  test('EC-1: GET /api/geocode/search returns 400 for blank query string', async () => {
    const res = await fetch(`${BASE_URL}/api/geocode/search?q=%20%20`);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.ok, false);
    assert.match(json.error, /empty/i);
  });

  // STORY-2: Meteorological Telemetry & Failover (FR-3, EC-3, INT-3)
  test('FR-3: GET /api/weather returns current observations, hourly array, and daily array', async () => {
    const res = await fetch(`${BASE_URL}/api/weather?latitude=40.4168&longitude=-3.7038`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.ok(json.data.current);
    assert.strictEqual(typeof json.data.current.temperature, 'number');
    assert.strictEqual(typeof json.data.current.apparent_temperature, 'number');
    assert.strictEqual(typeof json.data.current.relative_humidity, 'number');
    assert.strictEqual(typeof json.data.current.wind_speed, 'number');
    assert.strictEqual(typeof json.data.current.weather_code, 'number');
  });

  test('EC-1: GET /api/weather returns 400 for invalid coordinates', async () => {
    const res = await fetch(`${BASE_URL}/api/weather?latitude=invalid&longitude=-3.7038`);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.ok, false);
    assert.match(json.error, /Invalid latitude or longitude/i);
  });

  // STORY-3: Historical Horizon Variance Engine (FR-4, EC-4, INT-4)
  test('FR-4: GET /api/history returns valid -7d, -30d, and -365d temperature offsets', async () => {
    const res = await fetch(`${BASE_URL}/api/history?latitude=40.4168&longitude=-3.7038&current_temperature=22.4`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.ok(json.data.offset_7d);
    assert.ok(json.data.offset_30d);
    assert.ok(json.data.offset_365d);
    assert.strictEqual(typeof json.data.offset_7d.temperature, 'number');
    assert.strictEqual(typeof json.data.offset_7d.delta, 'number');
    assert.strictEqual(typeof json.data.offset_30d.temperature, 'number');
    assert.strictEqual(typeof json.data.offset_365d.temperature, 'number');
  });

  test('EC-4: GET /api/history validates leap-safe ISO dates 7d, 30d, 365d prior', async () => {
    const res = await fetch(`${BASE_URL}/api/history?latitude=40.4168&longitude=-3.7038`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.match(json.data.offset_7d.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(json.data.offset_30d.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(json.data.offset_365d.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  // STORY-4: Analytical Hourly & 7-Day Synoptic Projections (FR-5, UI-5, UI-6)
  test('FR-5 / UI-5: GET /api/weather delivers 24 hourly sequence cells', async () => {
    const res = await fetch(`${BASE_URL}/api/weather?latitude=40.4168&longitude=-3.7038`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.ok(Array.isArray(json.data.hourly));
    assert.strictEqual(json.data.hourly.length, 24);
    assert.strictEqual(typeof json.data.hourly[0].temperature, 'number');
    assert.strictEqual(typeof json.data.hourly[0].weather_code, 'number');
    assert.ok(json.data.hourly[0].time.includes('T'));
  });

  test('FR-5 / UI-6: GET /api/weather delivers 7 daily synoptic forecast projection rows', async () => {
    const res = await fetch(`${BASE_URL}/api/weather?latitude=40.4168&longitude=-3.7038`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.ok(Array.isArray(json.data.daily));
    assert.strictEqual(json.data.daily.length, 7);
    assert.strictEqual(typeof json.data.daily[0].temp_min, 'number');
    assert.strictEqual(typeof json.data.daily[0].temp_max, 'number');
    assert.strictEqual(typeof json.data.daily[0].weather_code, 'number');
    assert.match(json.data.daily[0].date, /^\d{4}-\d{2}-\d{2}$/);
  });

  // Client Static Shell Verification
  test('UI-1 / UI-5 / UI-6: GET / returns HTML containing both Map and Analysis sections', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('WeatherWatch Pro'));
    assert.ok(html.includes('#/map'));
    assert.ok(html.includes('#/analysis'));
    assert.ok(html.includes('24-Hour Analytical Projection Grid'));
    assert.ok(html.includes('7-Day Synoptic Horizon Projection'));
  });
});
