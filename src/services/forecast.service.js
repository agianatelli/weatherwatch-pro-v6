const { db } = require('../db');

// In-memory cache with TTL (5 minutes / 300 seconds as per INT-3)
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

function setCached(key, value, ttlSeconds = 300) {
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

function getDatabaseBaseline(locationId) {
  const currentBaseline = db.prepare(`
    SELECT temperature, apparent_temperature, relative_humidity, wind_speed, weather_code
    FROM weather_baselines
    WHERE location_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(locationId) || {
    temperature: 22.4,
    apparent_temperature: 21.8,
    relative_humidity: 48,
    wind_speed: 14.2,
    weather_code: 1
  };

  const hourlyRows = db.prepare(`
    SELECT hour_offset, temperature, weather_code
    FROM hourly_baselines
    WHERE location_id = ?
    ORDER BY hour_offset ASC
  `).all(locationId);

  const dailyRows = db.prepare(`
    SELECT day_offset, temp_min, temp_max, weather_code
    FROM daily_baselines
    WHERE location_id = ?
    ORDER BY day_offset ASC
  `).all(locationId);

  // Generate ISO timestamps anchored to today's local date
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const baseDateStr = `${year}-${month}-${day}`;

  // Ensure full 24-hour sequence is present
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const matchedRow = hourlyRows.find(r => r.hour_offset === h);
    const temp = matchedRow ? Number(matchedRow.temperature) : Number((Number(currentBaseline.temperature) - 3 + (h % 5)).toFixed(1));
    const code = matchedRow ? Number(matchedRow.weather_code) : Number(currentBaseline.weather_code);
    const hh = String(h).padStart(2, '0');
    hourly.push({
      time: `${baseDateStr}T${hh}:00`,
      temperature: temp,
      weather_code: code
    });
  }

  // Ensure full 7-day sequence is present
  const daily = [];
  for (let d = 0; d < 7; d++) {
    const matchedDay = dailyRows.find(r => r.day_offset === d);
    const dateObj = new Date(now.getTime() + d * 86400000);
    const dStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const minT = matchedDay ? Number(matchedDay.temp_min) : 13.5;
    const maxT = matchedDay ? Number(matchedDay.temp_max) : 23.0;
    const code = matchedDay ? Number(matchedDay.weather_code) : Number(currentBaseline.weather_code);

    daily.push({
      date: dStr,
      temp_min: minT,
      temp_max: maxT,
      weather_code: code
    });
  }

  return {
    current: {
      temperature: Number(currentBaseline.temperature),
      apparent_temperature: Number(currentBaseline.apparent_temperature),
      relative_humidity: Number(currentBaseline.relative_humidity),
      wind_speed: Number(currentBaseline.wind_speed),
      weather_code: Number(currentBaseline.weather_code)
    },
    hourly,
    daily
  };
}

async function getWeatherForecast(latitude, longitude) {
  const cacheKey = `weather:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;

  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();

      if (data && data.current) {
        // Map 24 hourly sequence
        const hourlyTimes = data.hourly?.time || [];
        const hourlyTemps = data.hourly?.temperature_2m || [];
        const hourlyCodes = data.hourly?.weather_code || [];
        const hourly = [];
        const maxHours = Math.min(24, hourlyTimes.length);
        for (let i = 0; i < maxHours; i++) {
          hourly.push({
            time: hourlyTimes[i],
            temperature: Number(hourlyTemps[i]),
            weather_code: Number(hourlyCodes[i])
          });
        }

        // Map 7-day sequence
        const dailyDates = data.daily?.time || [];
        const dailyMins = data.daily?.temperature_2m_min || [];
        const dailyMaxs = data.daily?.temperature_2m_max || [];
        const dailyCodes = data.daily?.weather_code || [];
        const daily = [];
        const maxDays = Math.min(7, dailyDates.length);
        for (let i = 0; i < maxDays; i++) {
          daily.push({
            date: dailyDates[i],
            temp_min: Number(dailyMins[i]),
            temp_max: Number(dailyMaxs[i]),
            weather_code: Number(dailyCodes[i])
          });
        }

        const payload = {
          ok: true,
          source: 'live',
          data: {
            current: {
              temperature: Number(data.current.temperature_2m),
              apparent_temperature: Number(data.current.apparent_temperature),
              relative_humidity: Number(data.current.relative_humidity_2m),
              wind_speed: Number(data.current.wind_speed_10m),
              weather_code: Number(data.current.weather_code)
            },
            hourly,
            daily
          }
        };

        setCached(cacheKey, payload, 300);
        return payload;
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
  }

  // EC-3 Fallback: Retrieve nearest seeded hub baseline
  const nearest = findNearestSeededHub(latitude, longitude);
  const baselineData = getDatabaseBaseline(nearest ? nearest.id : 1);

  const fallbackPayload = {
    ok: true,
    source: 'fallback',
    degraded: true,
    data: baselineData
  };

  setCached(cacheKey, fallbackPayload, 60);
  return fallbackPayload;
}

module.exports = {
  getWeatherForecast,
  getDatabaseBaseline
};
