const { db } = require('../db');

// In-memory cache with TTL (1 hour for search, 24 hours for reverse)
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

function setCached(key, value, ttlSeconds) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
}

function findNearestSeededLocation(lat, lon) {
  const locations = db.prepare('SELECT id, slug, name, admin1, country, latitude, longitude FROM locations').all();
  if (!locations || locations.length === 0) return null;

  let nearest = null;
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

function formatCoords(lat, lon) {
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}

async function reverseGeocode(latitude, longitude) {
  const cacheKey = `rev:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      
      const cityName = data.city || data.locality || '';
      const admin1 = data.principalSubdivision || '';
      const country = data.countryName || '';

      // Unnamed zone / oceanic check (EC-2)
      if (!cityName && !admin1 && !country) {
        const coordFallback = formatCoords(latitude, longitude);
        const result = {
          ok: true,
          source: 'live',
          data: {
            name: coordFallback,
            admin1: '',
            country: '',
            formatted: coordFallback,
            latitude,
            longitude
          }
        };
        setCached(cacheKey, result, 86400);
        return result;
      }

      const parts = [cityName, admin1, country].filter(Boolean);
      const formatted = parts.join(', ') || formatCoords(latitude, longitude);

      const result = {
        ok: true,
        source: 'live',
        data: {
          name: cityName || formatCoords(latitude, longitude),
          admin1,
          country,
          formatted,
          latitude,
          longitude
        }
      };

      setCached(cacheKey, result, 86400);
      return result;
    }
  } catch (err) {
    clearTimeout(timeoutId);
  }

  // Fallback to closest seeded hub or formatted coordinates (EC-2 / AD-4)
  const nearest = findNearestSeededLocation(latitude, longitude);
  let name = formatCoords(latitude, longitude);
  let admin1 = '';
  let country = '';

  if (nearest) {
    const distSq = Math.pow(nearest.latitude - latitude, 2) + Math.pow(nearest.longitude - longitude, 2);
    // If within approx ~35km (~0.3 degrees), reuse seeded label
    if (distSq < 0.1) {
      name = nearest.name;
      admin1 = nearest.admin1;
      country = nearest.country;
    }
  }

  const formatted = [name, admin1, country].filter(Boolean).join(', ') || name;
  const fallbackResult = {
    ok: true,
    source: 'fallback',
    data: {
      name,
      admin1,
      country,
      formatted,
      latitude,
      longitude
    }
  };

  setCached(cacheKey, fallbackResult, 3600);
  return fallbackResult;
}

async function searchGeocode(query) {
  const trimmed = query.trim();
  const cacheKey = `search:${trimmed.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Check seeded database locations first
  const dbMatches = db.prepare(
    `SELECT id, name, admin1, country, latitude, longitude 
     FROM locations 
     WHERE lower(name) LIKE lower(?) OR lower(slug) LIKE lower(?) LIMIT 5`
  ).all(`%${trimmed}%`, `%${trimmed}%`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=6&language=en&format=json`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const results = (data.results || []).map(item => ({
        id: item.id,
        name: item.name,
        admin1: item.admin1 || '',
        country: item.country || '',
        latitude: item.latitude,
        longitude: item.longitude
      }));

      const out = {
        ok: true,
        source: 'live',
        results
      };

      setCached(cacheKey, out, 3600);
      return out;
    }
  } catch (err) {
    clearTimeout(timeoutId);
  }

  // Fallback to seeded database results
  const results = dbMatches.map(m => ({
    id: m.id,
    name: m.name,
    admin1: m.admin1,
    country: m.country,
    latitude: m.latitude,
    longitude: m.longitude
  }));

  const fallbackOut = {
    ok: true,
    source: 'fallback',
    results
  };

  setCached(cacheKey, fallbackOut, 600);
  return fallbackOut;
}

module.exports = {
  reverseGeocode,
  searchGeocode,
  formatCoords
};
