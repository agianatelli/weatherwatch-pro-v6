const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { resetDb } = require('./db');
const weatherRoutes = require('./routes/weather.routes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'online', ok: true });
});

// Database reset endpoint
app.post('/api/reset', (req, res) => {
  try {
    resetDb();
    res.status(200).json({ ok: true, message: 'Database reset to baseline seeds.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Domain Routes (Geocode & Weather)
app.use('/api', weatherRoutes);

// Express 5 SPA fallback handler using standard middleware
app.use((req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ ok: false, error: 'Route not found' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`WeatherWatch Pro v6 running on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
