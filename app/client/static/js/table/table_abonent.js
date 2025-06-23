configElement = document.getElementById('table-messages');

try {
    map_config = JSON.parse(configElement.textContent);
} catch (e) {
    console.error('Error parsing initial table message:', e);
    map_config = {};
}
console.log(map_config)
updateTable(map_config)
startUpdatingTimes();

// // Хранилища для маркеров и путей
// const markers = new Map();
// const paths = new Map();
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



// // Инициализация карты
// function handleMapInit(data) {
//     if (data.view) {
//         map.setView([data.view.lat, data.view.lon], data.view.zoom);
//     }
    
//     if (data.markers) {
//         data.markers.forEach(marker => addOrUpdateMarker(marker));
//     }
    
//     if (data.paths) {
//         data.paths.forEach(path => addOrUpdatePath(path));
//     }
    
//     // Если есть путь случайного маркера, отображаем его
//     if (data.random_marker_path && data.random_marker_path.length > 0) {
//         addOrUpdatePath({
//             source: 'random_marker_path',
//             coords: data.random_marker_path,
//             color: '#FF0000',
//             width: 3
//         });
        
//         // Отображаем последнюю точку маркера
//         const lastPoint = data.random_marker_path[data.random_marker_path.length - 1];
//         addOrUpdateMarker({
//             source: 'random_marker',
//             lat: lastPoint[0],
//             lon: lastPoint[1],
//             text: 'Random marker',
//             color: '#FF0000',
//             visible: true
//         });
//     }
// }

// // Функции работы с маркерами и путями
// function addOrUpdateMarker(data) {
//     if (!data || !data.source) return;
    
//     let marker = markers.get(data.source);
//     const latlng = [data.lat, data.lon]; // Поддержка и lon
    
//     if (marker) {
//         marker.setLatLng(latlng);
//         marker.setPopupContent(data.text || data.source);
//         marker.setIcon(createCustomIcon(data.color || '#FF0000'));
        
//         if (data.visible && !map.hasLayer(marker)) {
//             marker.addTo(map);
//         } else if (!data.visible && map.hasLayer(marker)) {
//             map.removeLayer(marker);
//         }
//     } else {
//         marker = L.marker(latlng, {
//             icon: createCustomIcon(data.color || '#FF0000')
//         }).bindPopup(data.text || data.source);
        
//         if (data.visible !== false) {
//             marker.addTo(map);
//         }
        
//         markers.set(data.source, marker);
//     }
//     // Если это новый случайный маркер, добавляем его в таблицу
//     if (data.source.startsWith('random_marker_') && !tableData[data.source]) {
//         const tableUpdate = {
//             ...tableData,
//             [data.source]: {
//                 name: data.text || data.source,
//                 alt: Math.floor(Math.random() * 1000),
//                 time: Date.now() / 1000,
//                 visible: true,
//                 trace: true
//             }
//         };
//         updateTable(tableUpdate);
//     }
// }

// function addOrUpdatePath(data) {
//     if (!data || !data.source || !data.coords) return;
    
//     let path = paths.get(data.source);
    
//     if (path) {
//         path.setLatLngs(data.coords);
//         path.setStyle({
//             color: data.color || '#0000FF',
//             weight: data.width || 2
//         });
//     } else {
//         path = L.polyline(data.coords, {
//             color: data.color || '#0000FF',
//             weight: data.width || 2
//         }).addTo(map);
        
//         paths.set(data.source, path);
//     }
//     console.log(data)
//     // if (data.visible && !map.hasLayer(path)) {
//     //         path.addTo(map);
//     //     } else if (!data.visible && map.hasLayer(path)) {
//     //         map.removeLayer(path);
//     //     }
// }

// function createCustomIcon(color) {
//     return L.divIcon({
//         className: 'custom-marker',
//         html: `<svg width="24" height="24" viewBox="0 0 24 24">
//             <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
//         </svg>`,
//         iconSize: [24, 24],
//         iconAnchor: [12, 24]
//     });
// }





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

// Функция обновления таблицы данными из БД
function updateTable(messages) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    // Стили для статус-точки (добавьте в CSS)
    const style = document.createElement('style');
    style.textContent = `
        .status-dot {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 5px;
        }
    `;
    document.head.appendChild(style);

    messages.forEach(message => {
        const row = document.createElement('tr');
        row.dataset.moduleId = message.id_module;

        // Статус с цветной точкой
        const statusCell = document.createElement('td');
        
        // Создаем цветную точку
        const statusDot = document.createElement('span');
        statusDot.className = 'status-dot';
        
        // Определяем цвет точки на основе статуса GPS и времени
        const statusColor = getStatusColor(message.datetime, message.gps_ok);
        statusDot.style.backgroundColor = statusColor;
        
        // Добавляем текст статуса рядом с точкой
        const statusText = document.createElement('span');
        statusText.textContent = message.gps_ok ? ' OK' : ' Ошибка';
        statusText.style.color = message.gps_ok ? 'green' : 'red';
        
        statusCell.appendChild(statusDot);
        statusCell.appendChild(statusText);
        row.appendChild(statusCell);

        // Чекбокс видимости маркера
        const visibleCell = document.createElement('td');
        const visibleCheckbox = document.createElement('input');
        visibleCheckbox.type = 'checkbox';
        visibleCheckbox.checked = true; // По умолчанию видим
        visibleCheckbox.addEventListener('change', (e) => {
            // Здесь можно добавить логику обновления видимости в БД через AJAX
            console.log(`Visibility changed for module ${message.id_module}: ${e.target.checked}`);
        });
        visibleCell.appendChild(visibleCheckbox);
        row.appendChild(visibleCell);

        // Чекбокс видимости пути
        const traceCell = document.createElement('td');
        const traceCheckbox = document.createElement('input');
        traceCheckbox.type = 'checkbox';
        traceCheckbox.checked = false; // По умолчанию не показывать трассу
        traceCheckbox.addEventListener('change', (e) => {
            console.log(`Trace visibility changed for module ${message.id_module}: ${e.target.checked}`);
        });
        traceCell.appendChild(traceCheckbox);
        row.appendChild(traceCell);

        // ФИО (без возможности редактирования)
        const nameCell = document.createElement('td');
        nameCell.textContent = message.module_name;
        nameCell.style.color = message.module_color;
        row.appendChild(nameCell);

        // Высота
        const altCell = document.createElement('td');
        altCell.textContent = `${Math.round(message.alt)} м`; // Округляем высоту
        row.appendChild(altCell);

        // Время
        const timeCell = document.createElement('td');
        timeCell.textContent = formatTime(message.datetime);
        timeCell.dataset.originalTime = message.datetime;
        row.appendChild(timeCell);

        // Действия (кнопка удаления)
        const actionsCell = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = 'Удалить';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Удалить модуль ${message.module_name}?`)) {
                console.log(`Deleting module ${message.id_module}`);
                // AJAX запрос для удаления из БД
            }
        });
        actionsCell.appendChild(deleteBtn);
        row.appendChild(actionsCell);

        tbody.appendChild(row);
    });
    
    // // Обработчики обновлений
    // socket.on('marker_update', function(data) {
    //     if (data.source === 'random_marker') {
    //         addOrUpdateMarker(data);
    //     }
    // });

    // socket.on('path_update', function(data) {
    //     if (data.source === 'random_marker_path') {
    //         addOrUpdatePath(data);
    //     }
    // });
}

// Обновленная функция определения цвета статуса
function getStatusColor(datetime) {   
    if (!datetime) return 'gray';
    
    const now = new Date();
    const messageTime = new Date(datetime);
    const diffSeconds = (now - messageTime) / (1000);
    
    if (diffSeconds < 10) return 'green';   // До 10 секунд - зеленый
    if (diffSeconds < 60) return 'yellow'; // 10-60 секунд - желтый
    return 'red';                          // Более минуты - красный
}

function formatTime(datetimeString) {
    if (!datetimeString) return 'Н/Д';
    
    // Преобразуем строку времени из БД в объект Date
    const messageTime = new Date(datetimeString);
    
    // Проверка на валидность даты
    if (isNaN(messageTime.getTime())) {
        console.error('Invalid datetime string:', datetimeString);
        return 'Н/Д';
    }
    
    const now = new Date();
    const elapsedSeconds = Math.floor((now - messageTime) / 1000);
    
    // Форматирование в минуты:секунды
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Функция обновления времени в таблице
function updateTableTimes() {
    const rows = document.getElementById('table-body').rows;
    for (let i = 0; i < rows.length; i++) {
        const source = rows[i].dataset.source;
        if (tableData[source]) {
            const timeCell = rows[i].cells[5];
            timeCell.textContent = formatTime(tableData[source].time);
            
            // Обновляем цвет статуса
            const statusDot = rows[i].cells[0].querySelector('.status-dot');
            statusDot.style.backgroundColor = getStatusColor(tableData[source].time);
        }
    }
}

// Функция для обновления времени каждую секунду
function startUpdatingTimes() {
    setInterval(() => {
        const timeCells = document.querySelectorAll('#table-body td:nth-child(6)');
        timeCells.forEach(cell => {
            const originalTime = cell.dataset.originalTime;
            if (originalTime) {
                cell.textContent = formatTime(originalTime);
            }
        });
    }, 1000);
}



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



// // Инициализация Socket.IO
// connectSocketIO();