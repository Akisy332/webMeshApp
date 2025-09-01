"use strict";

// Класс для работы с сегментированными путями
class SegmentedPath {
    constructor(map, color, maxPointsPerSegment = 10000) {
        this.map = map;
        this.color = color;
        this.maxPointsPerSegment = maxPointsPerSegment;

        this.isLiveMode = false

        // Все точки пути (включая те, что еще не отображаются)
        this.allPoints = [];

        // Текущие отображаемые точки (до времени слайдера)
        this.visiblePoints = [];

        // Сегменты для оптимизации
        this.segments = [];
        this.segmentPaths = [];

        this.marker = null;
        this.visible = true;
        this.options = {
            color: color,
            weight: 3,
            opacity: 1
        };

        // Для оптимизации поиска
        this.lastSegmentIndex = 0;
        this.lastPointIndex = 0;
        this.maxSegmentLength = 0;

        this.init();
    }

    // Инициализация пути
    init() {
        this.createPaths();
        this.createMarker();
    }

    // Сегментация пути
    segmentPath() {
        this.segments = [];
        if (this.allPoints.length == 0) return;

        if (this.allPoints.length <= this.maxPointsPerSegment) {
            this.segments.push(this.allPoints);
            this.maxSegmentLength = this.allPoints.length;
            return;
        }

        // Разбиваем на сегменты с перекрытием в 1 точку для соединения
        for (let i = 0; i < this.allPoints.length; i += this.maxPointsPerSegment - 1) {
            const endIndex = Math.min(i + this.maxPointsPerSegment, this.allPoints.length);
            const segment = this.allPoints.slice(i, endIndex);
            this.segments.push(segment);

            if (segment.length > this.maxSegmentLength) {
                this.maxSegmentLength = segment.length;
            }

            if (endIndex >= this.allPoints.length) break;
        }
    }

    // Создание визуальных элементов пути
    createPaths() {
        // Удаляем старые пути, если они есть
        this.segmentPaths.forEach(path => this.map.removeLayer(path));
        this.segmentPaths = [];

        for (let i = 0; i < this.segments.length; i++) {
            const path = L.polyline([], {
                color: this.color,
                weight: 3,
                opacity: 1
            });

            if (this.visible) {
                path.addTo(this.map);
            }

            this.segmentPaths.push(path);
        }
    }

    // Создание маркера
    createMarker() {
        if (this.marker) {
            this.map.removeLayer(this.marker);
        }

        this.marker = L.marker([0, 0], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: `<svg width="48" height="48" viewBox="0 0 24 24">
                <path fill="${this.color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>`,
                iconSize: [48, 48],  // Increased size from 24x24 to 48x48
                iconAnchor: [24, 48],  // Anchor at bottom middle (half of width, full height)
                popupAnchor: [0, -48]  // Optional: adjust popup position if needed
            }),
            opacity: this.visible ? 1 : 0
        }).addTo(this.map);
    }

    // Обновление отображения пути в зависимости от времени
    update(currentTime) {
        // Если нет точек, ничего не делаем
        if (this.allPoints.length === 0) {
            return;
        }

        // Находим индекс последней видимой точки
        let newIndex = -1;

        // Используем бинарный поиск для оптимизации
        let left = 0;
        let right = this.allPoints.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);

            if (this.allPoints[mid].timestamp <= currentTime) {
                newIndex = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        // Обновляем видимые точки (все точки до и включая текущее время)
        this.visiblePoints = newIndex >= 0 ? this.allPoints.slice(0, newIndex + 1) : [];

        // Обновляем отображение сегментов
        this.updateSegmentsDisplay();
    }

    // Обновление отображения сегментов
    updateSegmentsDisplay() {
        // Сначала скрываем все сегменты
        for (let segIdx = 0; segIdx < this.segmentPaths.length; segIdx++) {
            this.segmentPaths[segIdx].setStyle({ opacity: 0, weight: 0 });
        }

        // Определяем, какие сегменты нужно отобразить
        let pointsProcessed = 0;
        let lastVisibleSegment = -1;

        for (let segIdx = 0; segIdx < this.segments.length; segIdx++) {
            const segment = this.segments[segIdx];
            const segmentEndIndex = pointsProcessed + segment.length - 1;

            // Если этот сегмент полностью видим
            if (segmentEndIndex < this.visiblePoints.length) {
                this.segmentPaths[segIdx].setLatLngs(segment.map(p => p.latlng));
                this.segmentPaths[segIdx].setStyle({
                    opacity: this.visible ? 1 : 0,
                    weight: this.visible ? 3 : 0
                });
                lastVisibleSegment = segIdx;
            }
            // Если часть сегмента видима
            else if (pointsProcessed < this.visiblePoints.length) {
                const visibleInSegment = this.visiblePoints.slice(pointsProcessed, this.visiblePoints.length);
                this.segmentPaths[segIdx].setLatLngs(visibleInSegment.map(p => p.latlng));
                this.segmentPaths[segIdx].setStyle({
                    opacity: this.visible ? 1 : 0,
                    weight: this.visible ? 3 : 0
                });
                lastVisibleSegment = segIdx;
                break;
            } else {
                break;
            }

            pointsProcessed += segment.length;
        }

        // Обновляем маркер
        if (this.visiblePoints.length > 0) {
            const lastPoint = this.visiblePoints[this.visiblePoints.length - 1];
            this.marker.setLatLng(lastPoint.latlng);
            this.marker.setOpacity(this.visible ? 1 : 0);
        } else {
            this.marker.setOpacity(0);
        }
    }

    // Переключение видимости пути
    toggleVisibility() {
        this.visible = !this.visible;
        this.updateSegmentsDisplay();
        this.marker.setOpacity(this.visible && this.visiblePoints.length > 0 ? 1 : 0);
        return this.visible;
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

    // Добавление точки в конец пути
    addLatLng(latlng, timestamp = null, currentTime = null) {
        const newPoint = {
            latlng: Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng],
            timestamp: timestamp || 0
        };

        this.allPoints.push(newPoint);

        // Перестраиваем сегменты при необходимости
        if (this.segments.length === 0 ||
            this.segments[this.segments.length - 1].length >= this.maxPointsPerSegment) {
            this.segmentPath();
            this.createPaths();
        } else {
            // Просто добавляем точку в последний сегмент
            this.segments[this.segments.length - 1].push(newPoint);
        }

        // Если в режиме реального времени, сразу обновляем отображение
        if (this.isLiveMode) {
            this.visiblePoints.push(newPoint);
            this.updateSegmentsDisplay();
        } else if (currentTime !== null) {
            // В ползунковом режиме проверяем, должна ли точка быть видимой
            if (newPoint.timestamp <= currentTime) {
                this.visiblePoints.push(newPoint);
                this.updateSegmentsDisplay();
            }
        }

        return this;
    }

    // Добавление массива точек
    addLatLngs(latLngs, timestamps = null, currentTime = null) {
        for (let i = 0; i < latLngs.length; i++) {
            const timestamp = timestamps && i < timestamps.length
                ? timestamps[i]
                : 0;

            this.addLatLng(latLngs[i], timestamp, currentTime);
        }

        return this;
    }

    // Установка всех точек пути
    setLatLngs(latLngs, timestamps = null, currentTime = null) {
        this.allPoints = [];

        for (let i = 0; i < latLngs.length; i++) {
            const timestamp = timestamps && i < timestamps.length
                ? timestamps[i]
                : 0;
            if (latLngs[i].length === 2)
                this.allPoints.push({
                    latlng: Array.isArray(latLngs[i]) ? latLngs[i] : [latLngs[i].lat, latLngs[i].lng],
                    timestamp: timestamp
                });
        }

        // Полностью пересоздаем сегменты
        this.segmentPath();
        this.createPaths();

        // Обновляем отображение в зависимости от режима
        if (this.isLiveMode) {
            this.visiblePoints = [...this.allPoints];
            this.updateSegmentsDisplay();
        } else if (currentTime !== null) {
            this.update(currentTime);
        }

        return this;
    }

    // Получение всех точек пути
    getLatLngs() {
        return this.allPoints.map(point => point.latlng);
    }

    // Удаление точки по индексу
    removeLatLng(index = -1, currentTime = null) {
        if (index < 0) index = this.allPoints.length - 1;

        if (index >= 0 && index < this.allPoints.length) {
            this.allPoints.splice(index, 1);

            // Также удаляем из видимых точек, если они есть
            if (index < this.visiblePoints.length) {
                this.visiblePoints.splice(index, 1);
            }

            // Полностью пересоздаем сегменты при удалении
            this.segmentPath();
            this.createPaths();

            // Обновляем отображение
            if (this.isLiveMode) {
                this.updateSegmentsDisplay();
            } else if (currentTime !== null) {
                this.update(currentTime);
            }
        }

        return this;
    }

    // Очистка всех точек
    clearLayers() {
        this.allPoints = [];
        this.visiblePoints = [];

        // Полностью пересоздаем сегменты
        this.segmentPath();
        this.createPaths();

        // Скрываем маркер
        this.marker.setOpacity(0);

        return this;
    }

    // Установка стиля
    setStyle(style) {
        this.options = { ...this.options, ...style };

        // Применяем стиль ко всем сегментам
        for (let segIdx = 0; segIdx < this.segmentPaths.length; segIdx++) {
            this.segmentPaths[segIdx].setStyle(this.options);
        }

        return this;
    }

    // Добавление на карту
    addTo(map) {
        this.map = map;
        this.createPaths();
        this.createMarker();
        return this;
    }

    // Удаление с карты
    remove() {
        this.segmentPaths.forEach(path => this.map.removeLayer(path));
        if (this.marker) {
            this.map.removeLayer(this.marker);
        }
        return this;
    }

    // Получение информации о пути
    getInfo() {
        if (this.allPoints.length === 0) {
            return {
                timeRange: {
                    min: 0,
                    max: 0,
                },
                visible: this.visible,
                segmentCount: 0,
                pointCount: 0
            };
        }

        return {
            timeRange: {
                min: this.allPoints[0].timestamp,
                max: this.allPoints[this.allPoints.length - 1].timestamp
            },
            visible: this.visible,
            segmentCount: this.segments.length,
            pointCount: this.allPoints.length
        };
    }
}


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

        eventBus.on(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, currentUnixTime => {
            this.paths.forEach((path) => {
                if (path.getInfo().visible) path.update(currentUnixTime);
            });
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
            // this.map.removeLayer(path);
            path.remove()
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
            const response = await this.getTraceModule(id_module, this.currentSession.id, 0);
            this.addTrace(response);
        } else
            path.toggleVisibility();
        await this.setTimeRange();
        //     if (flag && !this.map.hasLayer(path)) {
        //     path.addTo(this.map);
        // } else if (!flag && this.map.hasLayer(path)) {
        //     this.map.removeLayer(path);
        // }

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
            // path = L.polyline(coords, {
            //     color: data.module_color || '#FF0000',
            //     weight: data.width || 2
            // }).addTo(this.map);

            path = new SegmentedPath(this.map, data.module_color || '#FF0000')
            path.setLatLngs(coords, data.timestamps)

            this.paths.set(data.id_module, path);



        }
    }

    async setTimeRange() {
        let min = 9999999999;
        let max = 0;

        this.paths.forEach((path) => {
            const dataPath = path.getInfo();
            if (dataPath.visible && dataPath.timeRange.min < min && dataPath.timeRange.min != 0) min = dataPath.timeRange.min;
            if (dataPath.visible && dataPath.timeRange.max > max) max = dataPath.timeRange.max;
        });

        if (min === 9999999999) min = 0;

        console.log("Время пути: ", min, " - ", max);
        eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, { min, max });
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