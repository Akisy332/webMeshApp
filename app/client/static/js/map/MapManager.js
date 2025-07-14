"use strict";

class MapManager {
    constructor(mapId) {

        const map_config = {
            lat: 56.4520,
            lon:  84.9615,
            zoom: 13
        };

        // Initialize map
        this.map = L.map(mapId).setView(
            [map_config.lat, map_config.lon],
            map_config.zoom
        );

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        // Хранилища для слоев, маркеров и путей
        this.layers = {};
        this.markers = new Map();
        this.paths = new Map();


        eventBus.on(EventTypes.TABLE.CHECKBOX_MARKER, data => {
            this.setMarkerVisible(data.id_module, data.flag);
        });
        eventBus.on(EventTypes.TABLE.CHECKBOX_TRACE, (data) => {
            this.setTraceVisible(data.id_module, data.flag);
        });
        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data) => {
            if (!data || !data.coords || !data.coords.lat || !data.coords.lon) return
            else {
                console.log("test3: ", !data || !data.coords || !data.coords.lat || !data.coords.lon)
                let path = this.paths.get(data.id_module);
                if (path) {
                    this.updateTrace(data);
                }
                this.addOrUpdateMarker(data);
            }
        });
    }
    
    setPosition(data){
        this.map.setView([data.lat, data.lon], data.zoom)
    }

    addOrUpdateMarker(data) {
        if (!data || !data.id_module) return;
        
        let marker = this.markers.get(data.id_module);
        if(data.coords.lat != null && data.coords.lon != null) {
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
            const response = await this.getTraceModule(id_module, 1, 1)
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



// // Глобальные переменные для таблицы
// let tableData = {};
// let tableUpdateInterval;

// // Обработчик изменения чекбокса видимости маркера
// function handleVisibilityChange(source, isVisible) {
//     // Обновляем видимость маркера
//     const marker = markers.get(source);
//     if (marker) {
//         if (isVisible) {
//             marker.addTo(map);
//         } else {
//             map.removeLayer(marker);
//         }
//     }
    
//     // Получаем данные о пути (если есть)
//     const path = paths.get(source + '_path');
    
//     // Если есть связанный путь и второй чекбокс активен
//     const rowData = tableData[source];
//     if (path && rowData && rowData.trace) {
//         if (isVisible) {
//             path.addTo(map);
//         } else {
//             map.removeLayer(path);
//         }
//     }
    
//     // Отправляем изменения на сервер
//     if (socket && socket.connected) {
//         socket.emit('update_table_row', {
//             source: source,
//             changes: { 
//                 visible: isVisible,
//                 // Не меняем trace, так как это отдельный чекбокс
//             }
//         });
//     }
// }

// // Обработчик изменения чекбокса видимости пути
// function handleTraceChange(source, isTraceVisible) {
//     const rowData = tableData[source];
//     if (!rowData) return;
    
//     // Получаем маркер и путь
//     const marker = markers.get(source);
//     const path = paths.get(source + '_path');
    
//     // Видимость пути зависит от видимости маркера И состояния чекбокса
//     if (path) {
//         if (isTraceVisible && rowData.visible && marker) {
//             path.addTo(map);
//         } else {
//             map.removeLayer(path);
//         }
//     }
    
//     // Отправляем изменения на сервер
//     if (socket && socket.connected) {
//         socket.emit('update_table_row', {
//             source: source,
//             changes: { trace: isTraceVisible }
//         });
//     }
// }

// // Обработчик кнопки добавления строки
// document.getElementById('add-row').addEventListener('click', function() {
//     const source = 'row_' + Date.now();
//     socket.emit('add_table_row', {
//         source: source,
//         name: 'Новый объект ' + (Object.keys(tableData).length + 1),
//         alt: Math.floor(Math.random() * 1000),
//         time: Date.now() / 1000
//     });
// });




// let socket = null;

// // Инициализация Socket.IO
// function connectSocketIO() {
//     if (socket && socket.connected) {
//         return;
//     }

//     console.log('Connecting Socket.IO...');
//     socket = io();

//     socket.on('connect', () => {
//         console.log('Socket.IO connected');
//         // Запускаем обновление времени каждую секунду
//         tableUpdateInterval = setInterval(updateTableTimes, 1000);
//     });

//     socket.on('disconnect', (reason) => {
//         console.log('Socket.IO disconnected:', reason);
//         clearInterval(tableUpdateInterval);
//     });

//     socket.on('connect_error', (error) => {
//         console.error('Socket.IO connection error:', error);
//     });

//     // Обработчики событий
//     socket.on('map_init', (data) => {
//         handleMapInit(data);
//         if (data.table_data) {
//             updateTable(data.table_data);
//         }
//     });
    
    
//     socket.on('path_update', addOrUpdatePath);
//     socket.on('table_update', updateTable);
//     // Обработчик события обновления маркера
//     socket.on('marker_update', function(data) {
//         addOrUpdateMarker(data);
//     });
// }  



// // Инициализация Socket.IO
// connectSocketIO();