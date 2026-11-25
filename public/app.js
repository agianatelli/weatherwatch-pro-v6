document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    activeView: 'map',
    isDark: false,
    loading: false,
    resetting: false,
    searching: false,
    geoLocating: false,
    geocodingLoading: false,
    telemetryLoading: false,
    historyLoading: false,
    isDegraded: false,
    toasts: [],
    toastCounter: 0,

    // Target coordinate state (Single Source of Truth - AD-1)
    coords: {
      latitude: 40.4168,
      longitude: -3.7038
    },

    currentLocation: {
      name: 'Madrid',
      admin1: 'Comunidad de Madrid',
      country: 'Spain',
      formatted: 'Madrid, Comunidad de Madrid, Spain'
    },
    locationSource: 'live',

    // Live & Projected Meteorological Telemetry (UI-4, UI-5, UI-6, FR-3, FR-5)
    weather: {
      source: 'live',
      current: null,
      hourly: [],
      daily: []
    },

    // Historical Horizon Variance State (UI-4, FR-4, AD-2, INT-4)
    history: {
      source: 'live',
      offset_7d: null,
      offset_30d: null,
      offset_365d: null
    },

    searchQuery: '',
    searchResults: [],

    activeHub: 'madrid',
    hubs: [
      { slug: 'madrid', name: 'Madrid', latitude: 40.4168, longitude: -3.7038 },
      { slug: 'barcelona', name: 'Barcelona', latitude: 41.3851, longitude: 2.1734 },
      { slug: 'valencia', name: 'Valencia', latitude: 39.4699, longitude: -0.3763 },
      { slug: 'sevilla', name: 'Sevilla', latitude: 37.3891, longitude: -5.9845 }
    ],

    // Leaflet map instances
    mapInstance: null,
    markerInstance: null,

    init() {
      // 1. Synchronize Theme from LocalStorage / prefers-color-scheme
      this.initTheme();

      // 2. Synchronize Hash Navigation (#/map vs #/analysis)
      this.initRouting();

      // 3. Initialize Leaflet Map
      this.$nextTick(() => {
        this.renderIcons();
        this.initMap();
        // 4. Initial target coordinate dispatch
        this.setTargetCoordinates(this.coords.latitude, this.coords.longitude, 'hub');
      });
    },

    initTheme() {
      const savedTheme = localStorage.getItem('ww_theme');
      if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        this.isDark = true;
        document.documentElement.classList.add('dark');
      } else {
        this.isDark = false;
        document.documentElement.classList.remove('dark');
      }
    },

    toggleTheme() {
      this.isDark = !this.isDark;
      if (this.isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('ww_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('ww_theme', 'light');
      }
      this.$nextTick(() => this.renderIcons());
    },

    initRouting() {
      const handleHash = () => {
        const hash = window.location.hash.replace(/^#\/?/, '');
        if (hash === 'analysis') {
          this.activeView = 'analysis';
        } else {
          this.activeView = 'map';
          if (this.mapInstance) {
            setTimeout(() => {
              this.mapInstance.invalidateSize();
            }, 50);
          }
        }
        this.$nextTick(() => this.renderIcons());
      };

      window.addEventListener('hashchange', handleHash);
      if (!window.location.hash) {
        window.location.hash = '#/map';
      } else {
        handleHash();
      }
    },

    initMap() {
      const mapEl = document.getElementById('map-viewport');
      if (!mapEl || this.mapInstance || !window.L) return;

      this.mapInstance = L.map('map-viewport', {
        center: [this.coords.latitude, this.coords.longitude],
        zoom: 6,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(this.mapInstance);

      this.markerInstance = L.marker([this.coords.latitude, this.coords.longitude], {
        draggable: false
      }).addTo(this.mapInstance);

      this.markerInstance.bindPopup(this.currentLocation.formatted || 'Madrid, Spain');

      // Click coordinate acquisition (FR-2, AD-1)
      this.mapInstance.on('click', (e) => {
        const { lat, lng } = e.latlng;
        this.setTargetCoordinates(lat, lng, 'map_click');
      });
    },

    updateMapMarker(lat, lon) {
      if (!this.mapInstance || !this.markerInstance) return;
      this.markerInstance.setLatLng([lat, lon]);
      this.mapInstance.panTo([lat, lon], { animate: true });
      if (this.currentLocation.formatted) {
        this.markerInstance.setPopupContent(this.currentLocation.formatted);
      }
    },

    // Coordinate-First Single-Source-of-Truth Dispatcher (AD-1)
    async setTargetCoordinates(latitude, longitude, source = 'manual') {
      this.coords.latitude = Number(latitude);
      this.coords.longitude = Number(longitude);

      const matchedHub = this.hubs.find(h => 
        Math.abs(h.latitude - this.coords.latitude) < 0.05 && 
        Math.abs(h.longitude - this.coords.longitude) < 0.05
      );
      this.activeHub = matchedHub ? matchedHub.slug : null;

      this.updateMapMarker(this.coords.latitude, this.coords.longitude);

      // Concurrently dispatch reverse-geocoding, telemetry, and historical variance
      await Promise.all([
        this.resolveReverseGeocode(this.coords.latitude, this.coords.longitude),
        this.fetchTelemetry(this.coords.latitude, this.coords.longitude),
        this.fetchHistory(this.coords.latitude, this.coords.longitude)
      ]);
    },

    async resolveReverseGeocode(lat, lon) {
      this.geocodingLoading = true;
      try {
        const res = await fetch(`/api/geocode/reverse?latitude=${lat}&longitude=${lon}`);
        const data = await res.json();
        if (data.ok && data.data) {
          this.currentLocation = data.data;
          this.locationSource = data.source;
          if (this.markerInstance) {
            this.markerInstance.setPopupContent(data.data.formatted);
          }
        } else {
          this.currentLocation = {
            name: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
            admin1: '',
            country: '',
            formatted: `Lat: ${lat.toFixed(4)}°, Lon: ${lon.toFixed(4)}°`
          };
          this.locationSource = 'fallback';
        }
      } catch (err) {
        this.showToast('Network error resolving settlement name.', 'error');
        this.currentLocation = {
          name: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
          admin1: '',
          country: '',
          formatted: `Lat: ${lat.toFixed(4)}°, Lon: ${lon.toFixed(4)}°`
        };
        this.locationSource = 'fallback';
      } finally {
        this.geocodingLoading = false;
        this.$nextTick(() => this.renderIcons());
      }
    },

    async fetchTelemetry(lat, lon) {
      this.telemetryLoading = true;
      try {
        const res = await fetch(`/api/weather?latitude=${lat}&longitude=${lon}`);
        const json = await res.json();

        if (json.ok && json.data) {
          this.weather.source = json.source;
          this.weather.current = json.data.current;
          this.weather.hourly = json.data.hourly || [];
          this.weather.daily = json.data.daily || [];

          if (json.source === 'fallback' || json.degraded) {
            this.isDegraded = true;
            this.showToast('Data Source Offline - Displaying Baseline Cache', 'info');
          } else {
            this.isDegraded = false;
          }
        } else {
          this.isDegraded = true;
          this.showToast('Telemetry acquisition degraded. Using baseline dataset.', 'error');
        }
      } catch (err) {
        this.isDegraded = true;
        this.showToast('Network error contacting telemetry service.', 'error');
      } finally {
        this.telemetryLoading = false;
        this.$nextTick(() => this.renderIcons());
      }
    },

    // Historical Horizon Variance Fetcher (FR-4, EC-4, AD-2)
    async fetchHistory(lat, lon) {
      this.historyLoading = true;
      try {
        const tempParam = this.weather.current?.temperature !== undefined ? `&current_temperature=${this.weather.current.temperature}` : '';
        const res = await fetch(`/api/history?latitude=${lat}&longitude=${lon}${tempParam}`);
        const json = await res.json();

        if (json.ok && json.data) {
          this.history.source = json.source;
          this.history.offset_7d = json.data.offset_7d;
          this.history.offset_30d = json.data.offset_30d;
          this.history.offset_365d = json.data.offset_365d;
        }
      } catch (err) {
        console.error('Failed to load historical variance:', err);
      } finally {
        this.historyLoading = false;
        this.$nextTick(() => this.renderIcons());
      }
    },

    selectHub(hub) {
      this.activeHub = hub.slug;
      this.setTargetCoordinates(hub.latitude, hub.longitude, 'hub');
    },

    async executeSearch() {
      const q = this.searchQuery.trim();
      if (!q) {
        this.showToast('Please enter a location name to search.', 'error');
        return;
      }

      this.searching = true;
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();

        if (!json.ok || !json.results || json.results.length === 0) {
          this.showToast('Location not found. Retaining prior coordinate.', 'error');
          return;
        }

        if (json.results.length === 1) {
          const match = json.results[0];
          this.searchResults = [];
          this.setTargetCoordinates(match.latitude, match.longitude, 'search');
          this.searchQuery = match.name;
        } else {
          this.searchResults = json.results;
        }
      } catch (err) {
        this.showToast('Search service unavailable. Retaining coordinate.', 'error');
      } finally {
        this.searching = false;
        this.$nextTick(() => this.renderIcons());
      }
    },

    applySearchResult(item) {
      this.searchResults = [];
      this.searchQuery = item.name;
      this.setTargetCoordinates(item.latitude, item.longitude, 'search_select');
    },

    acquireBrowserLocation() {
      if (!('geolocation' in navigator)) {
        this.showToast('Browser geolocation not supported. Madrid baseline active.', 'info');
        return;
      }

      this.geoLocating = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.geoLocating = false;
          const { latitude, longitude } = position.coords;
          this.setTargetCoordinates(latitude, longitude, 'gps');
          this.showToast('Location acquired successfully via GPS.', 'info');
        },
        (error) => {
          this.geoLocating = false;
          this.showToast('GPS unavailable. Defaulting to Madrid baseline.', 'info');
          this.setTargetCoordinates(40.4168, -3.7038, 'fallback_gps');
        },
        { timeout: 7000 }
      );
    },

    formatDelta(delta) {
      if (delta === null || delta === undefined) return '--';
      const num = Number(delta);
      return (num > 0 ? `+${num.toFixed(1)}` : num.toFixed(1)) + '°C';
    },

    formatHourLabel(isoString) {
      if (!isoString) return '--:00';
      const parts = isoString.split('T');
      if (parts[1]) {
        return parts[1].substring(0, 5);
      }
      return isoString;
    },

    formatDayLabel(isoDate) {
      if (!isoDate) return 'Day';
      const date = new Date(isoDate + 'T00:00:00');
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    },

    // Weather condition translation table (WMO code to glyph & human label)
    getWeatherDescription(code) {
      if (code === undefined || code === null) return { text: 'Clear Sky', icon: 'sun' };
      const c = Number(code);
      if (c === 0) return { text: 'Clear Sky', icon: 'sun' };
      if (c === 1) return { text: 'Mainly Clear', icon: 'sun-medium' };
      if (c === 2) return { text: 'Partly Cloudy', icon: 'cloud-sun' };
      if (c === 3) return { text: 'Overcast', icon: 'cloud' };
      if (c === 45 || c === 48) return { text: 'Foggy / Haze', icon: 'cloud-fog' };
      if (c >= 51 && c <= 55) return { text: 'Drizzle', icon: 'cloud-drizzle' };
      if (c >= 61 && c <= 65) return { text: 'Rain Shower', icon: 'cloud-rain' };
      if (c >= 71 && c <= 75) return { text: 'Snow Flurry', icon: 'snowflake' };
      if (c >= 80 && c <= 82) return { text: 'Heavy Rain', icon: 'cloud-lightning' };
      if (c >= 95) return { text: 'Thunderstorm', icon: 'zap' };
      return { text: 'Scattered Clouds', icon: 'cloud' };
    },

    renderIcons() {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    },

    showToast(message, type = 'info', duration = 4000) {
      const id = ++this.toastCounter;
      this.toasts.push({ id, message, type, visible: true });
      this.$nextTick(() => this.renderIcons());

      if (duration > 0) {
        setTimeout(() => {
          this.removeToast(id);
        }, duration);
      }
    },

    removeToast(id) {
      const index = this.toasts.findIndex(t => t.id === id);
      if (index !== -1) {
        this.toasts[index].visible = false;
        setTimeout(() => {
          this.toasts = this.toasts.filter(t => t.id !== id);
        }, 200);
      }
    },

    async resetDemo() {
      this.resetting = true;
      try {
        const res = await fetch('/api/reset', { method: 'POST' });
        const json = await res.json();
        if (json.ok) {
          this.showToast('Demo data successfully reset to baseline seeds.', 'info');
          this.setTargetCoordinates(40.4168, -3.7038, 'reset');
        } else {
          this.showToast(json.error || 'Failed to reset demo data.', 'error');
        }
      } catch (err) {
        this.showToast('Network error while resetting baseline data.', 'error');
      } finally {
        this.resetting = false;
        this.$nextTick(() => this.renderIcons());
      }
    }
  }));
});
