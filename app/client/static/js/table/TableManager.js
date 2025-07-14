"use strict";

class TableManager {
    constructor(tableId) {
        this.map_config = {};
        this.tableData = {}; // Глобальное хранилище данных
        this.tableId = tableId

        this.initTooltip = this.initTooltip.bind(this);
        this.updateRowData = this.updateRowData.bind(this);
        this.updateDotAndTooltip = this.updateDotAndTooltip.bind(this);

        this.startUpdatingTimes();

        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data) => {
            if (!data || !data.coords || !data.coords.lat || !data.coords.lon) return
            this.updateTable(data)
        });

        // Подписка на событие очистки таблицы
        eventBus.on(EventTypes.TABLE.CLEAR, this.clearTable);

        // Подписка на событие загрузки новой сессии
        eventBus.on(EventTypes.SESSION.LOAD, (sessionData) => {
            this.clearTable();
            this.updateTable(sessionData);
        });
    }

    clearTable() {
        const tbody = document.getElementById(this.tableId);
        tbody.innerHTML = '';
        this.tableData = {};
        
        // Отправляем событие о очистке таблицы
        eventBus.emit(EventTypes.TABLE.CLEARED);
    }

    updateTable(messages) {
        // Приводим входные данные к массиву, если это не массив
        const messagesArray = Array.isArray(messages) ? messages : [messages];

        console.log("test", messagesArray);

        // Обновляем хранилище данных
        messagesArray.forEach(message => {
            this.tableData[message.id_module] = {
                datetime: message.datetime,
                gps_ok: message.gps_ok,
                alt: message.alt,
                module_name: message.module_name,
                module_color: message.module_color
            };
        });
        const tbody = document.getElementById(this.tableId);
        // Создаем или обновляем строки
        messagesArray.forEach(message => {
            let row = tbody.querySelector(`tr[data-module-id="${message.id_module}"]`);

            if (!row) {
                row = this.createTableRow(message);
                tbody.appendChild(row);
                // Убираем прямой вызов initTooltip, так как он уже вызывается в updateDotAndTooltip
            } else {
                this.updateRowData(row, message);
            }
        });
    }

    createTableRow(message) {
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
        console.log(message)

        // Время
        const timeCell = document.createElement('td');
        timeCell.textContent = this.formatTime(message.datetime);
        timeCell.dataset.originalTime = message.datetime;
        row.appendChild(timeCell);

        // Действия
        const actionsCell = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = 'Удалить';
        this.setupDeleteButton(deleteBtn, message.id_module, message.module_name);
        actionsCell.appendChild(deleteBtn);
        row.appendChild(actionsCell);

        // Первоначальное обновление статуса
        this.updateDotAndTooltip(statusDot, message.gps_ok, message.datetime);

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
        console.log("test2", message)
        this.tableData[message.id_module] = {
            datetime: message.datetime,
            gps_ok: message.gps_ok,
            alt: message.coords.alt,
            module_name: message.module_name,
            module_color: message.module_color
        };

        row.dataset.datetime = message.datetime;
        row.dataset.gpsOk = message.gps_ok ? '1' : '0';

        const dot = row.querySelector('.status-dot');
        if (dot) {
            this.updateDotAndTooltip(dot, message.gps_ok, message.datetime);
        }

        const altCell = row.querySelector('td:nth-child(5)');
        if (altCell) {
            altCell.textContent = `${Math.round(message.coords.alt)} м`;
        }

        const timeCell = row.querySelector('td:nth-child(6)');
        if (timeCell) {
            timeCell.textContent = this.formatTime(message.datetime);
            timeCell.dataset.originalTime = message.datetime;
        }

        const nameCell = row.querySelector('td:nth-child(4)');
        if (nameCell) {
            nameCell.textContent = message.module_name;
            nameCell.style.color = message.module_color;
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

    getStatusColor(gpsOk, datetime) {
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

    getTooltipText(gpsOk, datetime) {
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

    formatTime(datetimeString) {
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

    startUpdatingTimes() {
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
                        const color = this.getStatusColor(gpsOk, originalTime);
                        const tooltipText = this.getTooltipText(gpsOk, originalTime);

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