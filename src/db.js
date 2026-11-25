const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = process.env.DB_PATH || ':memory:';
const db = new DatabaseSync(dbPath);

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      admin1 TEXT NOT NULL,
      country TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      is_hub INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weather_baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      temperature REAL NOT NULL,
      apparent_temperature REAL NOT NULL,
      relative_humidity INTEGER NOT NULL,
      wind_speed REAL NOT NULL,
      weather_code INTEGER NOT NULL,
      history_7d_temp REAL NOT NULL,
      history_30d_temp REAL NOT NULL,
      history_365d_temp REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hourly_baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      hour_offset INTEGER NOT NULL,
      temperature REAL NOT NULL,
      weather_code INTEGER NOT NULL,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      UNIQUE(location_id, hour_offset)
    );

    CREATE TABLE IF NOT EXISTS daily_baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      day_offset INTEGER NOT NULL,
      temp_min REAL NOT NULL,
      temp_max REAL NOT NULL,
      weather_code INTEGER NOT NULL,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      UNIQUE(location_id, day_offset)
    );

    CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_locations_slug ON locations(slug);
  `);
}

function seedBaseline() {
  const seedFile = path.join(__dirname, '..', 'data', 'seed.sql');
  if (fs.existsSync(seedFile)) {
    const sql = fs.readFileSync(seedFile, 'utf8');
    db.exec(sql);
  }
}

function checkAndSeed() {
  initSchema();
  const countRow = db.prepare('SELECT COUNT(*) as count FROM locations').get();
  if (!countRow || countRow.count === 0) {
    seedBaseline();
  }
}

function resetDb() {
  initSchema();
  seedBaseline();
}

// Auto-initialize schema and seeds on startup
checkAndSeed();

module.exports = {
  db,
  resetDb
};
