const configElement = document.getElementById('map-config');

try {
    map_config = JSON.parse(configElement.textContent);
} catch (e) {
    console.error('Error parsing initial view config:', e);
    map_config = {
        lat: 56.4520,
        lon:  84.9615,
        zoom: 13
    };
}

// Initialize map
const map = L.map('map').setView(
    [map_config.lat, map_config.lon],
    map_config.zoom
);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

