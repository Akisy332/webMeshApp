// const configElement = document.getElementById('map-config');
let initialView;

// try {
//     initialView = JSON.parse(configElement.textContent);
// } catch (e) {
//     console.error('Error parsing initial view config:', e);
//     initialView = {
//         lat: 51.505,
//         lon: -0.09,
//         zoom: 13
//     };
// }

initialView = {
    lat: 51.505,
    lon: -0.09,
    zoom: 13
};

// Initialize map
const map = L.map('map').setView(
    [initialView.lat, initialView.lon],
    initialView.zoom
);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

