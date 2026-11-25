const { db } = require('../db');

// In-memory cache with 24h TTL (INT-4)
const cache = new Map();

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value, ttlSeconds = 86400) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
}

function findNearestSeededHub(lat, lon) {
  const locations = db.prepare('SELECT id, slug, name, admin1, country, latitude, longitude FROM locations').all();
  if (!locations || locations.length === 0) return null;

  let nearest = locations[0];
  let minDistance = Infinity;

  for (const loc of locations) {
    const dLat = loc.latitude - lat;
    const dLon = loc.longitude - lon;
    const distSq = dLat * dLat + dLon * dLon;
    if (distSq < minDistance) {
      minDistance = distSq;
      nearest = loc;
    }
  }

  return nearest;
}

function getDatabaseHistoricalBaseline(locationId, currentTemp = null) {
  const row = db.prepare(`
    SELECT temperature, history_7d_temp, history_30d_temp, history_365d_temp
    FROM weather_baselines
    WHERE location_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(locationId) || {
    temperature: 22.4,
    history_7d_temp: 21.2,
    history_30d_temp: 24.8,
    history_365d_temp: 21.6
  };

  const curTemp = currentTemp !== null && currentTemp !== undefined ? Number(currentTemp) : Number(row.temperature);

  const nowEpoch = Date.now();
  const date7d = new Date(nowEpoch - 7 * 86400000).toISOString().slice(0, 10);
  const date30d = new Date(nowEpoch - 30 * 86400000).toISOString().slice(0, 10);
  const date365d = new Date(nowEpoch - 365 * 86400000).toISOString().slice(0, 10);

  const temp7d = Number(row.history_7d_temp);
  const temp30d = Number(row.history_30d_temp);
  const temp365d = Number(row.history_365d_temp);

  return {
    offset_7d: {
      date: date7d,
      temperature: temp7d,
      delta: Number((curTemp - temp7d).toFixed(1))
    },
    offset_30d: {
      date: date30d,
      temperature: temp30d,
      delta: Number((curTemp - temp30d).toFixed(1))
    },
    offset_365d: {
      date: date365d,
      temperature: temp365d,
      delta: Number((curTemp - temp365d).toFixed(1))
    }
  };
}

async function fetchHistoricalArchiveDay(lat, lon, dateStr) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m&timezone=auto`;

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    const temps = data?.hourly?.temperature_2m;
    if (Array.isArray(temps) && temps.length > 0) {
      // Pick midday reading (hour 12) or average across the day
      const targetTemp = temps.length > 12 && temps[12] !== null ? temps[12] : temps[Math.floor(temps.length / 2)];
      return typeof targetTemp === 'number' ? Number(targetTemp.toFixed(1)) : null;
    }
    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function getHistoricalHorizon(latitude, longitude, currentTemperature = null) {
  const cacheKey = `history:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  const cached = getCached(cacheKey);
  if (cached) {
    // If current temperature was supplied and differs, recalculate signed deltas
    if (currentTemperature !== null && currentTemperature !== undefined) {
      const cur = Number(currentTemperature);
      return {
        ...cached,
        data: {
          offset_7d: {
            ...cached.data.offset_7d,
            delta: Number((cur - cached.data.offset_7d.temperature).toFixed(1))
          },
          offset_30d: {
            ...cached.data.offset_30d,
            delta: Number((cur - cached.data.offset_30d.temperature).toFixed(1))
          },
          offset_365d: {
            ...cached.data.offset_365d,
            delta: Number((cur - cached.data.offset_365d.temperature).toFixed(1))
          }
        }
      };
    }
    return cached;
  }

  // AD-2 & EC-4: Strict epoch millisecond evaluation without calendar leap drift
  const nowEpoch = Date.now();
  const date7d = new Date(nowEpoch - 7 * 86400000).toISOString().slice(0, 10);
  const date30d = new Date(nowEpoch - 30 * 86400000).toISOString().slice(0, 10);
  const date365d = new Date(nowEpoch - 365 * 86400000).toISOString().slice(0, 10);

  const nearestHub = findNearestSeededHub(latitude, longitude);
  const baselineHistorical = getDatabaseHistoricalBaseline(nearestHub ? nearestHub.id : 1, currentTemperature);

  let curTemp = currentTemperature !== null && currentTemperature !== undefined
    ? Number(currentTemperature)
    : 22.4;

  try {
    const [temp7d, temp30d, temp365d] = await Promise.all([
      fetchHistoricalArchiveDay(latitude, longitude, date7d),
      fetchHistoricalArchiveDay(latitude, longitude, date30d),
      fetchHistoricalArchiveDay(latitude, longitude, date365d)
    ]);

    if (temp7d !== null && temp30d !== null && temp365d !== null) {
      const liveData = {
        offset_7d: {
          date: date7d,
          temperature: temp7d,
          delta: Number((curTemp - temp7d).toFixed(1))
        },
        offset_30d: {
          date: date30d,
          temperature: temp30d,
          delta: Number((curTemp - temp30d).toFixed(1))
        },
        offset_365d: {
          date: date365d,
          temperature: temp365d,
          delta: Number((curTemp - temp365d).toFixed(1))
        }
      };

      const result = {
        ok: true,
        source: 'live',
        data: liveData
      };
      setCached(cacheKey, result, 86400);
      return result;
    }
  } catch (err) {
    // Graceful fallback to baseline
  }

  // AD-3: Degraded baseline provenance fallback
  const fallbackResult = {
    ok: true,
    source: 'fallback',
    degraded: true,
    data: baselineHistorical
  };

  setCached(cacheKey, fallbackResult, 300);
  return fallbackResult;
}

module.exports = {
  getHistoricalHorizon,
  getDatabaseHistoricalBaseline
};
