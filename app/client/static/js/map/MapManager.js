"use strict";

class MapManager {
    constructor(mapId) {

        const map_config = {
            lat: 56.4520,
            lon: 84.9615,
            zoom: 13
        };

        // Initialize map
        this.map = L.map(mapId).setView(
            [map_config.lat, map_config.lon],
            map_config.zoom
        );

        this.osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

	// Альтернативный слой (например, GoogleSattelite)
	this.GoogleSatteliteLayer = L.tileLayer('https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}&s=Ga', {
	   attribution: '© GoogleSattelite',
	   maxZoom: 19
	});

	// Добавляем переключатель слоёв
	this.baseLayers = {
	    "OpenStreetMap": this.osmLayer,
	    "GoogleSattelite": this.GoogleSatteliteLayer
	};
	L.control.layers(this.baseLayers).addTo(this.map);

        // Хранилища для слоев, маркеров и путей
        this.layers = {};
        this.markers = new Map();
        this.paths = new Map();

        this.currentSession = null;


        eventBus.on(EventTypes.TABLE.CHECKBOX_MARKER, data => {
            this.setMarkerVisible(data.id_module, data.flag);
        });
        eventBus.on(EventTypes.TABLE.CHECKBOX_TRACE, (data) => {
            this.setTraceVisible(data.id_module, data.flag);
        });
        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data) => {
            if (!data || !data.coords || !data.coords.lat || !data.coords.lon) return
            else {
                let path = this.paths.get(data.id_module);
                if (path) {
                    this.updateTrace(data);
                }
                this.addOrUpdateMarker(data);
            }
        });

        // Подписка на событие загрузки новой сессии
        eventBus.on(EventTypes.SESSION.LOAD_DATA, (sessionData) => {
            this.clearMap();
            sessionData.forEach((data) => {
                this.addOrUpdateMarker(data);
            });

        });

        eventBus.on(EventTypes.SESSION.SELECTED, (session) => {
            this.currentSession = session;
        });
    }

    clearMap() {
        // Clear all markers
        this.markers.forEach((marker, id_module) => {
            this.map.removeLayer(marker);
        });
        this.markers.clear();

        // Clear all paths
        this.paths.forEach((path, id_module) => {
            this.map.removeLayer(path);
        });
        this.paths.clear();
        console.info("Map: ", "Cleared")
        // // Clear all additional layers
        // Object.keys(this.layers).forEach(layerName => {
        //     this.map.removeLayer(this.layers[layerName]);
        // });
        // this.layers = {};
    }

    setPosition(data) {
        this.map.setView([data.lat, data.lon], data.zoom)
    }

    addOrUpdateMarker(data) {
        if (!data || !data.id_module) return;

        let marker = this.markers.get(data.id_module);
        if (data.coords.lat != null && data.coords.lon != null) {
            const latlng = [data.coords.lat, data.coords.lon];

            if (marker) {
                marker.setLatLng(latlng);
                marker.setPopupContent(data.module_name || data.id_module);
                marker.setIcon(this.createCustomIcon(data.module_color || '#FF0000'));

            } else {
                console.log("Create marker", data.id_module)
                marker = L.marker(latlng, {
                    icon: this.createCustomIcon(data.module_color || '#FF0000')
                }).bindPopup(data.module_name || data.id_module);

                marker.addTo(this.map);

                this.markers.set(data.id_module, marker);
            }
        }
    }

    setMarkerVisible(id_module, flag) {
        let marker = this.markers.get(id_module);
        if (flag && !this.map.hasLayer(marker)) {
            marker.addTo(this.map);
        } else if (!flag && this.map.hasLayer(marker)) {
            this.map.removeLayer(marker);
        }
    }

    async setTraceVisible(id_module, flag) {
        let path = this.paths.get(id_module);
        if (!path) {
            const response = await this.getTraceModule(id_module, this.currentSession.id, 0)
            this.addTrace(response)
        } else if (flag && !this.map.hasLayer(path)) {
            path.addTo(this.map);
        } else if (!flag && this.map.hasLayer(path)) {
            this.map.removeLayer(path);
        }

    }

    createCustomIcon(color) {
        return L.divIcon({
            className: 'custom-marker',
            html: `<svg width="48" height="48" viewBox="0 0 24 24">
                <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>`,
            iconSize: [48, 48],  // Increased size from 24x24 to 48x48
            iconAnchor: [24, 48],  // Anchor at bottom middle (half of width, full height)
            popupAnchor: [0, -48]  // Optional: adjust popup position if needed
        });
    }

    addTrace(data) {
        if (!data || !data.id_module || !data.coords) return;
        // Получаем текущий путь
        let path = this.paths.get(data.id_module);

        // Если coords - массив массивов (множество точек)
        const coords = Array.isArray(data.coords[0]) &&
            (typeof data.coords[0][0] === 'number' || Array.isArray(data.coords[0][0]))
            ? data.coords
            : [data.coords];

        if (!path) {
            console.log("Create Trace for marker ", data.id_module)
            // Создаем новый путь со всеми координатами
            path = L.polyline(coords, {
                color: data.module_color || '#FF0000',
                weight: data.width || 2
            }).addTo(this.map);

            this.paths.set(data.id_module, path);
        }
    }

    updateTrace(data) {
        if (!data || !data.id_module || !data.coords) return;

        // Получаем текущий путь
        let path = this.paths.get(data.id_module);

        // Если coords - массив массивов (множество точек)
        const coords = Array.isArray(data.coords[0]) &&
            (typeof data.coords[0][0] === 'number' || Array.isArray(data.coords[0][0]))
            ? data.coords
            : [data.coords];

        if (path) {
            // Если путь существует, обновляем его координаты
            const currentCoords = path.getLatLngs();
            const newCoords = [...currentCoords, ...coords];
            path.setLatLngs(newCoords);

            path.setStyle({
                color: data.module_color || '#FF0000',
                weight: data.width || 2
            });
        }
    }

    async getTraceModule(id_Module, id_Session, id_Message_Type) {
        try {
            // Формируем URL с параметрами
            const url = new URL('/get_trace_module', window.location.origin);
            url.searchParams.append('id_module', id_Module);
            url.searchParams.append('id_session', id_Session);
            url.searchParams.append('id_message_type', id_Message_Type);

            // Отправляем GET-запрос
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Ошибка HTTP: ${response.status}`);
            }

            const data = await response.json();
            console.log('Получены данные:', data);
            return data;
        } catch (error) {
            console.error('Ошибка при запросе данных:', error);
            throw error;
        }
    }
}