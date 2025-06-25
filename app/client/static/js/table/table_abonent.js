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

const configElement = document.getElementById('table-messages');
let map_config = {};
let tableData = {}; // Глобальное хранилище данных

try {
    map_config = JSON.parse(configElement.textContent);
} catch (e) {
    console.error('Error parsing initial table message:', e);
}

updateTable(map_config);
startUpdatingTimes();

function updateTable(messages) {
    const tbody = document.getElementById('table-body');
    
    // Обновляем хранилище данных
    messages.forEach(message => {
        tableData[message.id_module] = {
            datetime: message.datetime,
            gps_ok: message.gps_ok,
            alt: message.alt,
            module_name: message.module_name,
            module_color: message.module_color
        };
    });

    // Создаем или обновляем строки
    messages.forEach(message => {
        let row = tbody.querySelector(`tr[data-module-id="${message.id_module}"]`);
        
        if (!row) {
            row = createTableRow(message);
            tbody.appendChild(row);
            initTooltip(row.querySelector('.status-dot'));
        } else {
            updateRowData(row, message);
        }
    });
}

function createTableRow(message) {
    const row = document.createElement('tr');
    row.dataset.moduleId = message.id_module;
    row.dataset.datetime = message.datetime;
    row.dataset.gpsOk = message.gps_ok ? '1' : '0';

    // Ячейка статуса
    const statusCell = document.createElement('td');
    const statusDot = document.createElement('span');
    statusDot.className = 'status-dot dynamic-dot';
    statusDot.dataset.bsToggle = 'tooltip';
    statusDot.dataset.bsPlacement = 'top';
    statusCell.appendChild(statusDot);
    row.appendChild(statusCell);

    // Чекбокс видимости
    const visibleCell = document.createElement('td');
    const visibleCheckbox = document.createElement('input');
    visibleCheckbox.type = 'checkbox';
    visibleCheckbox.checked = true;
    visibleCheckbox.addEventListener('change', (e) => {
        console.log(`Visibility changed for module ${message.id_module}: ${e.target.checked}`);
    });
    visibleCell.appendChild(visibleCheckbox);
    row.appendChild(visibleCell);

    // Чекбокс трассы
    const traceCell = document.createElement('td');
    const traceCheckbox = document.createElement('input');
    traceCheckbox.type = 'checkbox';
    traceCheckbox.checked = false;
    traceCheckbox.addEventListener('change', (e) => {
        console.log(`Trace visibility changed for module ${message.id_module}: ${e.target.checked}`);
    });
    traceCell.appendChild(traceCheckbox);
    row.appendChild(traceCell);

    // ФИО
    const nameCell = document.createElement('td');
    nameCell.textContent = message.module_name;
    nameCell.style.color = message.module_color;
    row.appendChild(nameCell);

    // Высота
    const altCell = document.createElement('td');
    altCell.textContent = `${Math.round(message.coordinates.alt)} м`;
    row.appendChild(altCell);
    console.log(message)

    // Время
    const timeCell = document.createElement('td');
    timeCell.textContent = formatTime(message.datetime);
    timeCell.dataset.originalTime = message.datetime;
    row.appendChild(timeCell);

    // Действия
    const actionsCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = 'Удалить';
    setupDeleteButton(deleteBtn, message.id_module, message.module_name);
    actionsCell.appendChild(deleteBtn);
    row.appendChild(actionsCell);

    // Первоначальное обновление статуса
    updateDotAndTooltip(statusDot, message.gps_ok, message.datetime);

    return row;
}

function setupDeleteButton(button, id_module, module_name) {
    button.addEventListener('click', async () => {
        if (confirm(`Удалить модуль ${module_name}?`)) {
            try {
                // Отправляем запрос на сервер
                const response = await fetch('/api/delete-module', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ id: id_module, id_session })
                });

                if (!response.ok) {
                    throw new Error('Ошибка при удалении модуля на сервере');
                }

                // Если сервер успешно удалил запись, удаляем строку из таблицы
                const row = button.closest('tr');
                const dot = row.querySelector('.status-dot');
                
                if (dot && dot._tooltip) {
                    bootstrap.Tooltip.getInstance(dot)?.dispose();
                }
                
                delete tableData[id_module];
                row.remove();
                console.log(`Модуль ${id_module} успешно удален`);

            } catch (error) {
                console.error('Ошибка при удалении модуля:', error);
                alert('Не удалось удалить модуль. Пожалуйста, попробуйте снова.');
            }
        }
    });
}

function initTooltip(element) {
    if (element && !element._tooltip) {
        new bootstrap.Tooltip(element, {
            trigger: 'hover focus',
            title: element.dataset.bsTitle
        });
    }
}

function updateRowData(row, message) {
    tableData[message.id_module] = {
        datetime: message.datetime,
        gps_ok: message.gps_ok,
        alt: message.alt,
        module_name: message.module_name,
        module_color: message.module_color
    };
    
    row.dataset.datetime = message.datetime;
    row.dataset.gpsOk = message.gps_ok ? '1' : '0';
    
    const dot = row.querySelector('.status-dot');
    if (dot) {
        updateDotAndTooltip(dot, message.gps_ok, message.datetime);
    }
    
    const altCell = row.querySelector('td:nth-child(5)');
    if (altCell) {
        altCell.textContent = `${Math.round(message.alt)} м`;
    }
    
    const timeCell = row.querySelector('td:nth-child(6)');
    if (timeCell) {
        timeCell.textContent = formatTime(message.datetime);
        timeCell.dataset.originalTime = message.datetime;
    }
    
    const nameCell = row.querySelector('td:nth-child(4)');
    if (nameCell) {
        nameCell.textContent = message.module_name;
        nameCell.style.color = message.module_color;
    }
}

function updateDotAndTooltip(dot, gpsOk, datetime) {
    const tooltipText = getTooltipText(gpsOk, datetime);
    const color = getStatusColor(gpsOk, datetime);
    
    dot.style.backgroundColor = color;
    dot.dataset.bsTitle = tooltipText;
    
    const tooltip = bootstrap.Tooltip.getInstance(dot);
    if (tooltip) {
        tooltip.setContent({ '.tooltip-inner': tooltipText });
    }
}

function getStatusColor(gpsOk, datetime) {
    const now = new Date();
    const msgTime = new Date(datetime);
    const diffSeconds = (now - msgTime) / 1000;
    
    if (gpsOk) {
        if (diffSeconds < 10) return '#4CAF50';
        if (diffSeconds < 60) return '#FFC107';
        return '#F44336';
    } else {
        if (diffSeconds < 10) return '#2196F3';
        if (diffSeconds < 60) return '#FFC107';
        return '#F44336';
    }
}

function getTooltipText(gpsOk, datetime) {
    const now = new Date();
    const msgTime = new Date(datetime);
    const diffSeconds = (now - msgTime) / 1000;
    
    if (gpsOk) {
        if (diffSeconds < 10) return 'Статус: Активен\nДанные свежие (<10 сек)';
        if (diffSeconds < 60) return 'Статус: Активен\nДанные устаревают (10-60 сек)';
        return 'Статус: Активен\nДанные устарели (>60 сек)';
    } else {
        if (diffSeconds < 10) return 'Статус: Ошибка GPS\nНедавно (<10 сек)';
        if (diffSeconds < 60) return 'Статус: Ошибка GPS\n10-60 сек назад';
        return 'Статус: Ошибка GPS\n>60 сек назад';
    }
}

function formatTime(datetimeString) {
    if (!datetimeString) return 'Н/Д';
    
    const messageTime = new Date(datetimeString);
    if (isNaN(messageTime.getTime())) {
        console.error('Invalid datetime string:', datetimeString);
        return 'Н/Д';
    }
    
    const now = new Date();
    const elapsedSeconds = Math.floor((now - messageTime) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function startUpdatingTimes() {
    setInterval(() => {
        const now = new Date();
        
        document.querySelectorAll('#table-body tr').forEach(row => {
            try {
                const originalTime = row.dataset.datetime;
                if (!originalTime) return;
                
                const messageTime = new Date(originalTime);
                if (isNaN(messageTime.getTime())) return;
                
                // Обновляем время
                const elapsedSeconds = Math.floor((now - messageTime) / 1000);
                const minutes = Math.floor(elapsedSeconds / 60);
                const seconds = elapsedSeconds % 60;
                const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                const timeCell = row.querySelector('td:nth-child(6)');
                if (timeCell) timeCell.textContent = timeText;
                
                // Обновляем статус без пересоздания тултипа
                const dot = row.querySelector('.status-dot');
                if (dot) {
                    const gpsOk = row.dataset.gpsOk === '1';
                    const color = getStatusColor(gpsOk, originalTime);
                    const tooltipText = getTooltipText(gpsOk, originalTime);
                    
                    dot.style.backgroundColor = color;
                    
                    // Безопасное обновление тултипа
                    const tooltip = bootstrap.Tooltip.getInstance(dot);
                    if (tooltip) {
                        dot.setAttribute('data-bs-original-title', tooltipText);
                        tooltip._config.title = tooltipText;
                    } else {
                        dot.setAttribute('data-bs-title', tooltipText);
                    }
                }
            } catch (e) {
                console.error('Error updating row:', e);
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