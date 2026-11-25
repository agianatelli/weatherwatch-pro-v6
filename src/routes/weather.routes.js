const express = require('express');
const { z } = require('zod');
const { reverseGeocode, searchGeocode } = require('../services/geocode.service');
const { getWeatherForecast } = require('../services/forecast.service');
const { getHistoricalHorizon } = require('../services/history.service');

const router = express.Router();

const coordsQuerySchema = z.object({
  latitude: z.coerce.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
  longitude: z.coerce.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
  current_temperature: z.coerce.number().optional()
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query cannot be empty').max(100, 'Search query too long')
});

// GET /api/weather?latitude=&longitude= (FR-3, FR-5, UI-4, UI-5, UI-6)
router.get('/weather', async (req, res) => {
  const parsed = coordsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid latitude or longitude coordinates.'
    });
  }

  try {
    const { latitude, longitude } = parsed.data;
    const result = await getWeatherForecast(latitude, longitude);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to retrieve meteorological telemetry.' });
  }
});

// GET /api/history?latitude=&longitude=&current_temperature= (FR-4, EC-4, INT-4)
router.get('/history', async (req, res) => {
  const parsed = coordsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid latitude or longitude coordinates.'
    });
  }

  try {
    const { latitude, longitude, current_temperature } = parsed.data;
    const result = await getHistoricalHorizon(latitude, longitude, current_temperature);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to retrieve historical horizon telemetry.' });
  }
});

// GET /api/geocode/search?q= (FR-2, EC-1, INT-2)
router.get('/geocode/search', async (req, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: parsed.error.issues[0]?.message || 'Search query cannot be empty'
    });
  }

  try {
    const result = await searchGeocode(parsed.data.q);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Geocoding service unavailable' });
  }
});

// GET /api/geocode/reverse?latitude=&longitude= (FR-1, EC-2, INT-1)
router.get('/geocode/reverse', async (req, res) => {
  const parsed = coordsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid coordinates for reverse geocoding.'
    });
  }

  try {
    const { latitude, longitude } = parsed.data;
    const result = await reverseGeocode(latitude, longitude);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Reverse geocoding failed' });
  }
});

module.exports = router;
