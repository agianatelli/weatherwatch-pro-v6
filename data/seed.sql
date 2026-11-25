DELETE FROM daily_baselines;
DELETE FROM hourly_baselines;
DELETE FROM weather_baselines;
DELETE FROM locations;

-- Hub Locations
INSERT INTO locations (id, slug, name, admin1, country, latitude, longitude, is_hub) VALUES
(1, 'madrid', 'Madrid', 'Comunidad de Madrid', 'Spain', 40.4168, -3.7038, 1),
(2, 'barcelona', 'Barcelona', 'Catalonia', 'Spain', 41.3851, 2.1734, 1),
(3, 'valencia', 'Valencia', 'Valencian Community', 'Spain', 39.4699, -0.3763, 1),
(4, 'sevilla', 'Sevilla', 'Andalusia', 'Spain', 37.3891, -5.9845, 1);

-- Telemetry Baseline & Historical Records
INSERT INTO weather_baselines (location_id, temperature, apparent_temperature, relative_humidity, wind_speed, weather_code, history_7d_temp, history_30d_temp, history_365d_temp) VALUES
(1, 22.4, 21.8, 48, 14.2, 1, 21.2, 24.8, 21.6),
(2, 24.1, 24.6, 62, 18.0, 2, 23.0, 26.5, 23.2),
(3, 25.3, 26.0, 58, 12.5, 0, 24.1, 27.2, 24.5),
(4, 28.6, 29.2, 38, 9.8, 0, 27.0, 31.0, 27.8);

-- Madrid 24h Hourly Baseline (Sample representative subset across 24h)
INSERT INTO hourly_baselines (location_id, hour_offset, temperature, weather_code) VALUES
(1, 0, 16.5, 0), (1, 1, 15.9, 0), (1, 2, 15.2, 0), (1, 3, 14.8, 0),
(1, 4, 14.3, 0), (1, 5, 14.0, 1), (1, 6, 14.5, 1), (1, 7, 15.8, 1),
(1, 8, 17.4, 1), (1, 9, 19.1, 1), (1, 10, 20.8, 2), (1, 11, 21.9, 2),
(1, 12, 22.4, 2), (1, 13, 23.0, 2), (1, 14, 23.2, 1), (1, 15, 22.9, 1),
(1, 16, 22.1, 1), (1, 17, 21.0, 1), (1, 18, 19.8, 0), (1, 19, 18.7, 0),
(1, 20, 17.9, 0), (1, 21, 17.4, 0), (1, 22, 17.0, 0), (1, 23, 16.6, 0);

-- Madrid 7-Day Synoptic Baseline
INSERT INTO daily_baselines (location_id, day_offset, temp_min, temp_max, weather_code) VALUES
(1, 0, 14.0, 23.2, 1),
(1, 1, 13.8, 24.0, 0),
(1, 2, 14.5, 22.5, 2),
(1, 3, 15.0, 21.0, 3),
(1, 4, 13.2, 20.5, 61),
(1, 5, 12.8, 22.0, 1),
(1, 6, 13.5, 23.5, 0);
