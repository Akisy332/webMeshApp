"use strict";

class TableManager {
    constructor(tableId) {
        this.map_config = {};
        this.tableData = {}; // Глобальное хранилище данных
        this.tableId = tableId

        this.initTooltip = this.initTooltip.bind(this);
        this.updateRowData = this.updateRowData.bind(this);
        this.updateDotAndTooltip = this.updateDotAndTooltip.bind(this);

        this.currentSession = 0;

        this.startUpdatingTimes();

        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data) => {
            if (!data || !data.points) return;

            this.updateTable(data.points);

            // Обработка emergency и match_signal флагов
            this.processSignals(data);
        });

        // Подписка на событие загрузки новой сессии
        eventBus.on(EventTypes.SESSION.LOAD_DATA, (sessionData) => {
            console.info("Table: Event SESSION.LOAD_DATA", sessionData)
            this.updateTable(sessionData["modules"]);
        });

        eventBus.on(EventTypes.SESSION.SELECTED, (session) => {
            console.info("Table: Event SESSION.SELECTED", this.currentSession.id)
            console.log(this.currentSession.id, session.id)
            if (this.currentSession && this.currentSession.id !== session.id) {

                this.clearTable();
            }
            this.currentSession = session;
        });
    }

    // Добавляем метод для обработки сигналов
    processSignals(data) {
        if (!data.signal_info || !data.points) return;

        const signalInfo = data.signal_info;
        const points = data.points;

        // Создаем карту модулей для быстрого доступа
        const moduleMap = {};
        points.forEach(point => {
            moduleMap[point.id_module] = point;
        });

        // Обрабатываем каждый модуль из signal_info
        Object.keys(signalInfo).forEach(moduleId => {
            const signals = signalInfo[moduleId];
            const module = moduleMap[moduleId];

            if (!module) return;

            const moduleName = module.module_name || `Module ${moduleId}`;

            // Обработка emergency сигнала
            if (signals.emergency === 1) {
                showWarning(moduleName);
            }

            // Обработка match_signal
            if (signals.match_signal === 1) {
                showNote(moduleName);
            }
        });
    }

    clearTable() {
        console.info("Table: Clear table")
        const tbody = document.getElementById(this.tableId);
        tbody.innerHTML = '';
        this.tableData = {};
    }

    updateTable(messages) {
        // Приводим входные данные к массиву, если это не массив
        const messagesArray = Array.isArray(messages) ? messages : [messages];

        // Обновляем хранилище данных
        messagesArray.forEach(message => {
            if (message.id_session === this.currentSession.id) {
                this.tableData[message.id_module] = {
                    datetime: message.datetime_unix,
                    gps_ok: message.gps_ok,
                    alt: message.alt,
                    module_name: message.module_name,
                    module_color: message.module_color
                };
            };
        });
        const tbody = document.getElementById(this.tableId);
        // Создаем или обновляем строки
        messagesArray.forEach(message => {
            if (message.id_session === this.currentSession.id) {

                let row = tbody.querySelector(`tr[data-module-id="${message.id_module}"]`);

                if (!row) {
                    row = this.createTableRow(message);
                    tbody.appendChild(row);
                } else {
                    this.updateRowData(row, message);
                }
            };
        });
    }

    createTableRow(message) {
        const row = document.createElement('tr');
        row.dataset.moduleId = message.id_module;
        row.dataset.datetime_unix = message.datetime_unix;
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
            eventBus.emit(EventTypes.TABLE.CHECKBOX_MARKER, {
                id_module: message.id_module,
                flag: e.target.checked
            });
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
            eventBus.emit(EventTypes.TABLE.CHECKBOX_TRACE, {
                id_module: message.id_module,
                flag: e.target.checked
            });
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
        altCell.textContent = `${Math.round(message.coords.alt)} м`;
        row.appendChild(altCell);

        // Время
        const timeCell = document.createElement('td');
        timeCell.textContent = this.formatTime(message.datetime_unix);
        timeCell.dataset.originalTime = message.datetime_unix;
        row.appendChild(timeCell);

        // test
        const testCell = document.createElement('td');
        if (message.rssi !== null && message.snr !== null)
            testCell.textContent = `${message.rssi} : ${message.snr}`;
        else if (message.source !== null && message.jumps !== null)
            testCell.textContent = `${message.source} R ${message.jumps}`;
        else
            testCell.textContent = `Null`;
        row.appendChild(testCell);

        // Первоначальное обновление статуса
        this.updateDotAndTooltip(statusDot, message.gps_ok, message.datetime_unix);

        // Отложенная инициализация tooltip (если нужно)
        setTimeout(() => {
            if (!bootstrap.Tooltip.getInstance(statusDot)) {
                this.initTooltip(statusDot);
            }
        }, 50);

        return row;
    }

    setupDeleteButton(button, id_module, module_name) {
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

                    delete this.tableData[id_module];
                    row.remove();
                    console.log(`Модуль ${id_module} успешно удален`);

                } catch (error) {
                    console.error('Ошибка при удалении модуля:', error);
                    alert('Не удалось удалить модуль. Пожалуйста, попробуйте снова.');
                }
            }
        });
    }

    initTooltip(element) {
        if (!element || element._tooltip) return;

        try {
            element._tooltip = new bootstrap.Tooltip(element, {
                trigger: 'hover focus',
                title: element.getAttribute('data-bs-original-title') || ''
            });
        } catch (e) {
            console.error('Tooltip initialization error:', e);
        }
    }

    updateRowData(row, message) {
        this.tableData[message.id_module] = {
            datetime: message.datetime_unix,
            gps_ok: message.gps_ok,
            alt: message.coords.alt,
            module_name: message.module_name,
            module_color: message.module_color
        };

        row.dataset.datetime_unix = message.datetime_unix;
        row.dataset.gpsOk = message.gps_ok ? '1' : '0';

        const dot = row.querySelector('.status-dot');
        if (dot) {
            this.updateDotAndTooltip(dot, message.gps_ok, message.datetime_unix);
        }

        const altCell = row.querySelector('td:nth-child(5)');
        if (altCell) {
            altCell.textContent = `${Math.round(message.coords.alt)} м`;
        }

        const timeCell = row.querySelector('td:nth-child(6)');
        if (timeCell) {
            timeCell.textContent = this.formatTime(message.datetime_unix);
            timeCell.dataset.originalTime = message.datetime_unix;
        }

        const nameCell = row.querySelector('td:nth-child(4)');
        if (nameCell) {
            nameCell.textContent = message.module_name;
            nameCell.style.color = message.module_color;
        }

        // test
        const testCell = row.querySelector('td:nth-child(8)');
        if (testCell) {
            if (message.rssi !== null && message.snr !== null)
                testCell.textContent = `${message.rssi} : ${message.snr}`;
            else if (message.source !== null && message.jumps !== null)
                testCell.textContent = `${message.source} R ${message.jumps}`;
            else
                testCell.textContent = `Null`;
        }



    }

    updateDotAndTooltip(dot, gpsOk, datetime) {
        if (!dot) return;

        const tooltipText = this.getTooltipText(gpsOk, datetime);
        const color = this.getStatusColor(gpsOk, datetime);

        dot.style.backgroundColor = color;
        dot.setAttribute('data-bs-original-title', tooltipText);

        try {
            const tooltip = bootstrap.Tooltip.getInstance(dot);
            if (tooltip) {
                // Обновляем конфигурацию tooltip
                tooltip._config.title = tooltipText;

                // Проверяем, отображается ли tooltip в данный момент
                const isShown = tooltip.tip && tooltip.tip.classList.contains('show');

                if (isShown) {
                    tooltip.hide();
                    tooltip.show(); // Это обновит содержимое
                }
            } else {
                // Если tooltip еще не инициализирован, инициализируем
                this.initTooltip(dot);
            }
        } catch (e) {
            console.error('Tooltip update error:', e);
        }
    }

    getStatusColor(gpsOk, unixTimestamp) {
        const now = Date.now(); // всегда в миллисекундах
        let timestamp = typeof unixTimestamp === 'string' ? parseInt(unixTimestamp) : unixTimestamp;

        // Определяем формат timestamp и конвертируем в миллисекунды
        if (timestamp < 100000000000) {
            // Если timestamp в секундах (меньше 100000000000)
            timestamp = timestamp * 1000;
        }
        // Если timestamp уже в миллисекундах, оставляем как есть

        const diffSeconds = (now - timestamp) / 1000;

        if (gpsOk) {
            if (diffSeconds < 60) {
                return '#4CAF50';
            }
            if (diffSeconds < 300) {
                return '#FFC107';
            }
            return '#F44336';
        } else {
            if (diffSeconds < 60) {
                return '#2196F3';
            }
            if (diffSeconds < 300) {
                return '#FFC107';
            }
            return '#F44336';
        }
    }

    getTooltipText(gpsOk, unixTimestamp) {
        const now = Date.now(); // всегда в миллисекундах
        let timestamp = typeof unixTimestamp === 'string' ? parseInt(unixTimestamp) : unixTimestamp;

        // Определяем формат timestamp и конвертируем в миллисекунды
        if (timestamp < 100000000000) {
            // Если timestamp в секундах (меньше 100000000000)
            timestamp = timestamp * 1000;
        }
        // Если timestamp уже в миллисекундах, оставляем как есть

        const diffSeconds = (now - timestamp) / 1000;

        if (gpsOk) {
            if (diffSeconds < 60) return 'Статус: Активен\nДанные свежие (<60 сек)';
            if (diffSeconds < 300) return 'Статус: Активен\nДанные устаревают (60-300 сек)';
            return 'Статус: Активен\nДанные устарели (>300 сек)';
        } else {
            if (diffSeconds < 60) return 'Статус: Ошибка GPS\nНедавно (<60 сек)';
            if (diffSeconds < 300) return 'Статус: Ошибка GPS\n60-300 сек назад';
            return 'Статус: Ошибка GPS\n>300 сек назад';
        }
    }

    formatTime(unixTimestamp) {
        if (!unixTimestamp) return 'Н/Д';

        // Убедимся, что timestamp в миллисекундах (если приходит в секундах, умножаем на 1000)
        const timestamp = unixTimestamp.toString().length <= 10 ? unixTimestamp * 1000 : unixTimestamp;

        const messageTime = new Date(timestamp);
        if (isNaN(messageTime.getTime())) {
            console.error('Invalid timestamp:', unixTimestamp);
            return 'Н/Д';
        }

        const now = new Date();
        const elapsedSeconds = Math.floor((now - messageTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    startUpdatingTimes() {
        setInterval(() => {
            const now = new Date();

            document.querySelectorAll('#table-body tr').forEach(row => {
                try {
                    const unixTimestamp = row.dataset.datetime_unix;
                    if (!unixTimestamp) return;

                    // Конвертируем Unix-время в Date (проверяем, в секундах или миллисекундах)
                    const timestamp = unixTimestamp.toString().length <= 10 ? unixTimestamp * 1000 : unixTimestamp;
                    const messageTime = new Date(timestamp);
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
                        const color = this.getStatusColor(gpsOk, timestamp); // передаём timestamp вместо originalTime
                        const tooltipText = this.getTooltipText(gpsOk, timestamp); // передаём timestamp вместо originalTime

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
}