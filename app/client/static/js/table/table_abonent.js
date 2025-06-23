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

    messages.forEach(message => {
        const row = document.createElement('tr');
        row.dataset.moduleId = message.id_module;
        row.dataset.datetime = message.datetime;
        row.dataset.gpsOk = message.gps_ok ? '1' : '0';

        // Ячейка статуса
        const statusCell = document.createElement('td');
        
        // Контейнер для точки и подсказки
        const container = document.createElement('div');
        container.className = 'status-dot-container';
        
        // Цветная точка
        const statusDot = document.createElement('span');
        statusDot.className = 'status-dot dynamic-dot';
        
        // Подсказка
        const tooltip = document.createElement('div');
        tooltip.className = 'status-dot-tooltip';
        
        container.appendChild(statusDot);
        container.appendChild(tooltip);
        statusCell.appendChild(container);
        row.appendChild(statusCell);

        // Обновляем цвет и подсказку
        updateDotColorAndTooltip(statusDot, tooltip, message.gps_ok, message.datetime);

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
}

// Обновление цвета и подсказки
function updateDotColorAndTooltip(dot, tooltip, gpsOk, datetime) {
    const now = new Date();
    const msgTime = new Date(datetime);
    const diffSeconds = (now - msgTime) / 1000;
    let color, tooltipText;

    if (gpsOk) {
        if (diffSeconds < 10) {
            color = '#4CAF50'; // зеленый
            tooltipText = 'Статус: Активен\nДанные свежие (<10 сек)';
        } else if (diffSeconds < 60) {
            color = '#FFC107'; // желтый
            tooltipText = 'Статус: Активен\nДанные устаревают (10-60 сек)';
        } else {
            color = '#F44336'; // красный
            tooltipText = 'Статус: Активен\nДанные устарели (>60 сек)';
        }
    } else {
        if (diffSeconds < 10) {
            color = '#2196F3'; // синий
            tooltipText = 'Статус: Ошибка GPS\nНедавно (<10 сек)';
        } else if (diffSeconds < 60) {
            color = '#FFC107'; // желтый
            tooltipText = 'Статус: Ошибка GPS\n10-60 сек назад';
        } else {
            color = '#F44336'; // красный
            tooltipText = 'Статус: Ошибка GPS\n>60 сек назад';
        }
    }

    dot.style.backgroundColor = color;
    tooltip.textContent = tooltipText;
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
        document.querySelectorAll('.dynamic-dot').forEach(dot => {
            const row = dot.closest('tr');
            const gpsOk = parseInt(row.dataset.gpsOk);
            const datetime = row.dataset.datetime;
            updateDotColor(dot, gpsOk, datetime);
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