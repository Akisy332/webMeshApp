"use strict";

class MapManager {
    constructor(mapId) {
        // const configElement = document.getElementById('map-config');

        // try {
            // map_config = JSON.parse(configElement.textContent);
        // } catch (e) {
            // console.error('Error parsing initial map config:', e);
            const map_config = {
                lat: 56.4520,
                lon:  84.9615,
                zoom: 13
            };
        // }

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
        // Инициализация карты

        eventManager.on('changeVisibleMarker', data => {
            this.setMarkerVisible(data.id, data.flag);
        });
    }
    
    // addLayer(layerId, geoJson) {
    //     this.layers[layerId] = L.geoJSON(geoJson).addTo(this.map);
    // }
    
    // focusOnLayer(layerId) {
    //     // Логика фокусировки
    // }
    
    // Установка позиции карты и приближения
    setPosition(data){
        this.map.setView([data.lat, data.lon], data.zoom)
    }

    // Функция работы с маркерам
    addOrUpdateMarker(data) {
        if (!data || !data.id_module) return;
        
        let marker = this.markers.get(data.id_module);
        const latlng = [data.coordinates.lat, data.coordinates.lon];
        
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

    setMarkerVisible(id_module, flag) {
        let marker = this.markers.get(id_module);
        if (flag && !this.map.hasLayer(marker)) {
                marker.addTo(this.map);
            } else if (!flag && this.map.hasLayer(marker)) {
                this.map.removeLayer(marker);
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

}

function addOrUpdatePath(data) {
    if (!data || !data.source || !data.coords) return;
    
    let path = paths.get(data.source);
    
    if (path) {
        path.setLatLngs(data.coords);
        path.setStyle({
            color: data.color || '#0000FF',
            weight: data.width || 2
        });
    } else {
        path = L.polyline(data.coords, {
            color: data.color || '#0000FF',
            weight: data.width || 2
        }).addTo(map);
        
        paths.set(data.source, path);
    }
    console.log(data)
    // if (data.visible && !map.hasLayer(path)) {
    //         path.addTo(map);
    //     } else if (!data.visible && map.hasLayer(path)) {
    //         map.removeLayer(path);
    //     }
}






// // Обработчик кнопки - отправляем запрос на сервер
// document.getElementById('random-marker').addEventListener('click', function() {
//     if (socket && socket.connected) {
//         // Генерируем уникальный идентификатор для маркера
//         const source = 'random_marker_';
        
//         // Отправляем запрос на сервер с информацией о новом маркере
//         socket.emit('add_random_point', {
//             source: source,
//             name: 'Случайный маркер ' + (Object.keys(tableData).length + 1),
//             alt: Math.floor(Math.random() * 1000),
//             time: Date.now() / 1000,
//             visible: true,
//             trace: true
//         });
//     } else {
//         alert('Connection to server not established!');
//     }
// });


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