class FixedScrollbarVirtualizedTable {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('Container not found:', containerId);
            return;
        }

        this.options = {
            apiUrl: options.apiUrl || '/api/table/users',
            limit: options.limit || 50,
            rowHeight: options.rowHeight || 45,
            buffer: options.buffer || 10,
            cleanupThreshold: options.cleanupThreshold || 200,
            preloadThreshold: options.preloadThreshold || 20,
            ...options
        };

        this.dataMap = new Map();
        this.totalCount = 10000;
        this.totalVisibleCount = 10000;
        this.isLoading = false;
        this.hasMoreUp = true;
        this.hasMoreDown = true;

        this.currentSessionId = currentSessionId;

        this.pendingRequests = new Set();
        this.lastRequestedIds = new Set();

        this.lastScrollTop = 0;
        this.scrollThrottle = null;
        this.forceCheckTimeout = null;

        this.columnVisibility = {
            'id': false,
            'module_id': true,
            'module_name': false,
            'datetime_unix': true,
            'lat': false,
            'lon': false,
            'alt': true,
            'rssi': true,
            'snr': true,
            'source': true,
            'jumps': true,
        };

        this.columnDefinitions = [
            { key: 'id', title: 'ID', width: '80px' },
            { key: 'module_id', title: 'ID Модуля', width: '120px' },
            { key: 'module_name', title: 'Имя', width: '120px' },
            { key: 'datetime_unix', title: 'Время', width: '150px' },
            { key: 'lat', title: 'Широта', width: '80px' },
            { key: 'lon', title: 'Долгота', width: '80px' },
            { key: 'alt', title: 'Высота', width: '80px' },
            { key: 'rssi', title: 'RSSI', width: '40px' },
            { key: 'snr', title: 'SNR', width: '40px' },
            { key: 'source', title: 'Источник', width: '40px' },
            { key: 'jumps', title: 'Прыжков', width: '40px' },
        ];

        this.useDynamicWidth = true;

        this.init();
    }

    formatCellContent(item, columnKey) {
        switch (columnKey) {
            case 'id':
                return item.id.toString();
            case 'module_id':
                return item.module_id.toString();
            case 'module_name':
                return item.module_name;
            case 'datetime_unix':
                return item.datetime_unix.toString();
            case 'lat':
                return item.lat.toString();
            case 'lon':
                return item.lon.toString();
            case 'alt':
                return item.alt;
            case 'rssi':
                return item.rssi;
            case 'snr':
                return item.snr
            case 'source':
                return item.source
            case 'jumps':
                return item.jumps

            default:
                return item[columnKey] || '';
        }
    }

    resetColumns() {
        this.columnVisibility = {
            'id': false,
            'module_id': true,
            'module_name': false,
            'datetime_unix': true,
            'lat': false,
            'lon': false,
            'alt': true,
            'rssi': true,
            'snr': true,
            'source': true,
            'jumps': true,
        };
        this.saveColumnState();
        this.applyColumnVisibility();
    }

    calculateColumnWidth(column) {
        // Фиксированные ширины для разных типов данных
        const fixedWidths = {
            'id': 80,
            'module_id': 120,
            'module_name': 120,
            'datetime_unix': 150,
            'lat': 80,
            'lon': 80,
            'alt': 80,
            'rssi': 40,
            'snr': 40,
            'source': 40,
            'jumps': 40
        };

        return fixedWidths[column.key] || 120;
    }

    destroy() {
        // Очищаем обработчики событий
        if (this.scrollContainer) {
            this.scrollContainer.removeEventListener('scroll', this.handleScroll);
        }

        // Очищаем таймеры
        if (this.scrollThrottle) {
            clearTimeout(this.scrollThrottle);
        }
        if (this.forceCheckTimeout) {
            clearTimeout(this.forceCheckTimeout);
        }

        // Очищаем данные
        this.dataMap.clear();
        this.pendingRequests.clear();
        this.lastRequestedIds.clear();

        // Очищаем контейнер
        if (this.container) {
            this.container.innerHTML = '';
        }

        console.log('Virtual table destroyed');
    }

    clearTableData() {
        // Останавливаем текущие загрузки
        this.isLoading = false;

        // Очищаем все коллекции данных
        this.dataMap.clear();
        this.pendingRequests.clear();
        this.lastRequestedIds.clear();

        // Сбрасываем состояние загрузки
        this.hasMoreUp = true;
        this.hasMoreDown = true;
        this.totalCount = 10000;
        this.totalVisibleCount = 10000;

        // Очищаем таблицу
        if (this.tableBody) {
            this.tableBody.innerHTML = '';
        }

        // Сбрасываем скролл
        if (this.scrollContainer) {
            this.scrollContainer.scrollTop = 0;
        }

        // Обновляем скроллбар
        this.updateScrollbarSize();

        // Обновляем статистику
        this.updateStats();
        this.updateVisibleStats(0, 0, 0);

        console.log('Table data cleared');
    }

    init() {
        this.createTableStructure();
        this.setupScrollbar();
        this.setupScrollListener();
        this.loadInitialData();
        this.setupColumnToggles();
        this.initEvents();
    }

    setupColumnToggles() {
        this.loadColumnState();
        this.renderColumnToggles();
        this.applyColumnVisibility();
    }

    initEvents() {
        // eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data) => {
        //     this.updateTable(data)
        // });

        // Подписка на событие очистки таблицы
        eventBus.on(EventTypes.TABLE.CLEAR, this.clearTableData);

        // Подписка на событие загрузки новой сессии
        eventBus.on(EventTypes.SESSION.SELECTED, (session) => {
            this.clearTableData();
            this.currentSessionId = session.id;
            this.loadInitialData();
        });
    }

    // Рендеринг чекбоксов
    renderColumnToggles() {
        const container = document.getElementById('tab-columns');
        const flexContainer = container.querySelector('.d-flex.flex-wrap.gap-3');

        // Очищаем контейнер
        flexContainer.innerHTML = '';

        // Создаем чекбоксы для каждой колонки
        this.columnDefinitions.forEach(column => {
            const checkboxId = `toggle-${column.key}`;
            const isVisible = this.columnVisibility[column.key] !== undefined ? this.columnVisibility[column.key] : true;

            const formCheck = document.createElement('div');
            formCheck.className = 'form-check';

            formCheck.innerHTML = `
                <input class="form-check-input column-toggle" 
                       type="checkbox" 
                       id="${checkboxId}"
                       ${isVisible ? 'checked' : ''}
                       data-column="${column.key}">
                <label class="form-check-label" for="${checkboxId}">
                    ${column.title}
                </label>
            `;

            flexContainer.appendChild(formCheck);
        });
    }

    loadColumnState() {
        try {
            const savedState = localStorage.getItem('tableColumnVisibility');
            if (savedState) {
                this.columnVisibility = { ...this.columnVisibility, ...JSON.parse(savedState) };
            }
        } catch (e) {
            console.error('Error loading column state:', e);
        }
    }

    saveColumnState() {
        try {
            localStorage.setItem('tableColumnVisibility', JSON.stringify(this.columnVisibility));
        } catch (e) {
            console.error('Error saving column state:', e);
        }
    }

    applyColumnVisibility() {
        Object.keys(this.columnVisibility).forEach(columnKey => {
            const checkbox = document.querySelector(`.column-toggle[data-column="${columnKey}"]`);
            if (checkbox) {
                checkbox.checked = this.columnVisibility[columnKey];
            }
        });

        this.renderTableHeaders();
        if (this.tableBody) {
            this.renderVisibleRows(true);
        }

        // ВАЖНО: Обновляем ширину таблицы после полного обновления DOM
        setTimeout(() => {
            this.updateTableWidth();
            // Дополнительное обновление через небольшой интервал
            setTimeout(() => {
                this.updatePanelWidth();
            }, 100);
        }, 150);
    }

    renderTableHeaders() {
        const thead = this.container.querySelector('thead');
        if (!thead) return;

        const headerRow = thead.querySelector('tr');
        if (!headerRow) return;

        headerRow.innerHTML = '';

        this.columnDefinitions.forEach(column => {
            if (this.columnVisibility[column.key]) {
                const th = document.createElement('th');
                th.textContent = column.title;
                th.className = 'dynamic-column';
                th.dataset.column = column.key;

                // Устанавливаем ширину на основе данных
                const sampleWidth = this.calculateColumnWidth(column);
                th.style.width = sampleWidth + 'px';
                th.style.minWidth = sampleWidth + 'px';

                headerRow.appendChild(th);
            }
        });

        this.updateTableWidth();
    }

    measureTextWidth(text) {
        // Создаем временный элемент для измерения
        const measureElement = document.createElement('span');
        measureElement.style.cssText = `
        position: absolute;
        left: -1000px;
        top: -1000px;
        white-space: nowrap;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
        padding: 8px 4px;
    `;
        measureElement.textContent = text;

        document.body.appendChild(measureElement);
        const width = measureElement.offsetWidth;
        document.body.removeChild(measureElement);

        return width;
    }

    updateTableWidth() {
        if (!this.useDynamicWidth) return;

        const table = this.container.querySelector('table');
        const tableContainer = this.container.querySelector('.table-responsive');

        if (table && tableContainer) {
            table.classList.add('dynamic-width');
            tableContainer.classList.add('dynamic-width');
            this.container.classList.add('dynamic-width');

            // ВАЖНО: Сначала сбрасываем ширину для правильного расчета
            tableContainer.style.width = 'auto';
            table.style.width = 'auto';

            // Принудительный reflow для обновления layout
            tableContainer.offsetHeight;

            // Вычисляем общую ширину таблицы на основе реальных размеров
            let totalWidth = 0;
            const visibleHeaders = table.querySelectorAll('th.dynamic-column');

            // ВАЖНО: Используем getBoundingClientRect() для точных измерений
            visibleHeaders.forEach(header => {
                const rect = header.getBoundingClientRect();
                totalWidth += rect.width;
            });

            // Добавляем отступ для scrollbar (только если есть скролл)
            const hasVerticalScroll = this.scrollContainer.scrollHeight > this.scrollContainer.clientHeight;
            if (hasVerticalScroll) {
                totalWidth += 17;
            }

            // Устанавливаем вычисленную ширину
            tableContainer.style.width = totalWidth + 'px';
            table.style.width = totalWidth + 'px';

            console.log('Table width updated:', {
                headersCount: visibleHeaders.length,
                totalWidth: totalWidth,
                scrollbar: hasVerticalScroll
            });

            // Обновляем scroll content
            this.updateScrollContentWidth();

            // Обновляем ширину панели
            this.updatePanelWidth();

            // Форсируем пересчет layout
            this.forceLayoutRecalculation();
        }
    }

    // Добавьте метод для принудительного пересчета layout
    forceLayoutRecalculation() {
        // Принудительный reflow
        this.container.offsetHeight;

        // Обновляем позиции строк после изменения ширины
        setTimeout(() => {
            this.renderVisibleRows(true);
        }, 50);
    }

    forceTableLayoutUpdate() {
        const table = this.container.querySelector('table');
        if (table) {
            table.style.width = '100%';
            table.offsetHeight;
        }
    }

    createTableStructure() {
        this.container.innerHTML = `
        <div class="table-responsive" id="scroll-container">
            <div id="scroll-content"></div>
            <table class="table table-striped table-hover mb-0 dynamic-width">
                <thead>
                    <tr>
                        <!-- Заголовки будут рендериться динамически -->
                    </tr>
                </thead>
                <tbody id="virtual-data-table"></tbody>
            </table>
        </div>
    `;

        this.tableBody = document.getElementById('virtual-data-table');
        this.scrollContent = document.getElementById('scroll-content');
        this.scrollContainer = document.getElementById('scroll-container');

        if (!this.tableBody || !this.scrollContent || !this.scrollContainer) {
            console.error('Required DOM elements not found');
            return;
        }

        this.renderTableHeaders();

        // Принудительно обновляем размеры после создания
        setTimeout(() => {
            this.updateTableWidth();
            this.updateScrollbarSize();
        }, 100);
    }

    setupScrollbar() {
        this.updateScrollbarSize();
    }

    updateScrollbarSize() {
        const totalHeight = this.totalVisibleCount * this.options.rowHeight;
        this.scrollContent.style.height = `${totalHeight}px`;
    }

    // Добавьте новый метод
    updateScrollContentWidth() {
        if (!this.scrollContent) return;

        if (this.useDynamicWidth) {
            const tableContainer = this.container.querySelector('.table-responsive');
            if (tableContainer) {
                this.scrollContent.style.width = tableContainer.offsetWidth + 'px';
            }
        } else {
            this.scrollContent.style.width = '1px'; // Исходное значение
        }
    }

    setupScrollListener() {
        this.scrollContainer.addEventListener('scroll', () => {
            this.handleScroll();
        });
    }

    async loadInitialData() {
        await this.loadData(0, 'down');
        this.renderVisibleRows();
    }

    async loadData(startId, direction) {
        const requestKey = `${direction}-${startId}`;

        if (this.pendingRequests.has(requestKey) || this.lastRequestedIds.has(startId)) {
            return;
        }

        if (this.isLoading) {
            const timeSinceLastLoad = Date.now() - this.lastLoadTime;
            if (timeSinceLastLoad < 100) {
                return;
            }
        }

        this.isLoading = true;
        this.lastLoadTime = Date.now();
        this.pendingRequests.add(requestKey);
        this.lastRequestedIds.add(startId);
        this.showLoading();


        try {

            const sessionId = this.currentSessionId;
            const moduleIds = [];

            // Преобразуем массив в строку через запятую
            const moduleIdsString = moduleIds.join(',');

            const url = `${this.options.apiUrl}?session_id=${sessionId}&modules=${moduleIdsString}&limit=${this.options.limit}&offset=${startId}&direction=${direction}`;
            const response = await fetch(url);
            const result = await response.json();

            if (response.ok) {
                console.log(result)
                this.processLoadedData(result, direction);
            } else {
                console.error('Error loading data:', result.error);
            }
        } catch (error) {
            console.error('Network error:', error);
            this.lastRequestedIds.delete(startId);
        } finally {
            this.isLoading = false;
            this.pendingRequests.delete(requestKey);
            this.hideLoading();
        }
    }

    processLoadedData(result, direction) {
        if (result.total_count) {
            this.totalCount = result.total_count;
            this.totalVisibleCount = result.total_visible_count;
            this.updateScrollbarSize();
        }

        if (result.has_more !== undefined) {
            if (direction === 'down') {
                this.hasMoreDown = result.has_more;
            } else {
                this.hasMoreUp = result.has_more;
            }
        }

        if (result.data.length === 0) {
            if (direction === 'up') this.hasMoreUp = false;
            if (direction === 'down') this.hasMoreDown = false;
            return;
        }

        result.data.forEach(data => {
            this.dataMap.set(data.id, data);
        });

        this.updateStats();
        this.renderVisibleRows(true);

        setTimeout(() => {
            if (!this.isLoading) {
                this.checkForMoreData();
            }
        }, 200);
    }

    handleScroll() {
        const currentScrollTop = this.scrollContainer.scrollTop;
        const scrollDelta = Math.abs(currentScrollTop - this.lastScrollTop);

        if (scrollDelta > this.options.rowHeight * 10) {
            this.forceCheckData();
        }

        this.lastScrollTop = currentScrollTop;

        if (this.scrollThrottle) {
            clearTimeout(this.scrollThrottle);
        }

        this.scrollThrottle = setTimeout(() => {
            this.renderVisibleRows();
            this.checkForMoreData();
        }, 16);
    }

    checkForMoreData() {
        const scrollTop = this.scrollContainer.scrollTop;
        const visibleHeight = this.scrollContainer.clientHeight;
        const visibleStartId = Math.max(1, Math.floor(scrollTop / this.options.rowHeight) + 1);
        const visibleEndId = Math.min(this.totalVisibleCount, Math.floor((scrollTop + visibleHeight) / this.options.rowHeight) + 1);

        if (this.hasMoreDown !== false) {
            const distanceToBottom = this.totalVisibleCount - visibleEndId;

            if (distanceToBottom < this.options.preloadThreshold) {
                const nextStartId = this.getMaxLoadedId() + 1;

                if (nextStartId <= this.totalVisibleCount &&
                    !this.isLoading &&
                    !this.lastRequestedIds.has(nextStartId)) {

                    this.loadData(nextStartId, 'down');
                }
            }
        }

        if (this.hasMoreUp !== false) {
            const distanceToTop = visibleStartId - 1;

            const minLoadedId = this.getMinLoadedId();
            const needsMoreUp = visibleStartId < minLoadedId ||
                (visibleStartId - minLoadedId) < this.options.preloadThreshold;

            if (distanceToTop < this.options.preloadThreshold && needsMoreUp) {
                const nextStartId = Math.max(1, minLoadedId - this.options.limit + 15);

                if (nextStartId >= 1 &&
                    nextStartId < minLoadedId &&
                    !this.isLoading &&
                    !this.lastRequestedIds.has(nextStartId)) {

                    this.loadData(nextStartId, 'up');
                }
            }
        }

        if (this.dataMap.size > this.options.cleanupThreshold) {
            this.cleanupOldData();
        }
    }

    forceCheckData() {
        if (this.forceCheckTimeout) {
            clearTimeout(this.forceCheckTimeout);
        }

        this.forceCheckTimeout = setTimeout(() => {
            this.renderVisibleRows(true);
            this.aggressiveDataCheck();
        }, 100);
    }

    aggressiveDataCheck() {
        const scrollTop = this.scrollContainer.scrollTop;
        const visibleHeight = this.scrollContainer.clientHeight;
        const visibleStartId = Math.max(1, Math.floor(scrollTop / this.options.rowHeight) + 1);
        const visibleEndId = Math.min(this.totalVisibleCount, Math.floor((scrollTop + visibleHeight) / this.options.rowHeight) + 1);

        const missingIds = [];
        for (let id = visibleStartId; id <= visibleEndId; id++) {
            if (!this.dataMap.has(id) && !this.lastRequestedIds.has(id)) {
                missingIds.push(id);
            }
        }

        if (missingIds.length > 5) {
            const sortedMissingIds = missingIds.sort((a, b) => a - b);
            const loadStartId = sortedMissingIds[0];

            const maxLoadedId = this.getMaxLoadedId();
            const minLoadedId = this.getMinLoadedId();
            let direction = 'down';

            if (loadStartId < minLoadedId) {
                direction = 'up';
            } else if (loadStartId > maxLoadedId) {
                direction = 'down';
            } else {
                return;
            }

            if (!this.isLoading && !this.lastRequestedIds.has(loadStartId)) {
                this.loadData(loadStartId, direction);
            }
        }

        this.checkBoundariesConservatively(visibleStartId, visibleEndId);
    }

    checkBoundariesConservatively(visibleStartId, visibleEndId) {
        const minLoadedId = this.getMinLoadedId();
        const maxLoadedId = this.getMaxLoadedId();

        if (visibleStartId < minLoadedId && this.hasMoreUp !== false) {
            const missingTopCount = minLoadedId - visibleStartId;
            if (missingTopCount > this.options.preloadThreshold * 2) {
                const nextStartId = Math.max(1, minLoadedId - this.options.limit);
                if (!this.isLoading && !this.lastRequestedIds.has(nextStartId)) {
                    this.loadData(nextStartId, 'up');
                }
            }
        }

        if (visibleEndId > maxLoadedId && this.hasMoreDown !== false) {
            const missingBottomCount = visibleEndId - maxLoadedId;
            if (missingBottomCount > this.options.preloadThreshold * 2) {
                const nextStartId = maxLoadedId + 1;
                if (!this.isLoading && !this.lastRequestedIds.has(nextStartId)) {
                    this.loadData(nextStartId, 'down');
                }
            }
        }
    }

    getMinLoadedId() {
        if (this.dataMap.size === 0) return Infinity;
        const minId = Math.min(...Array.from(this.dataMap.keys()));
        return minId === Infinity ? 1 : minId;
    }

    getMaxLoadedId() {
        if (this.dataMap.size === 0) return -Infinity;
        const maxId = Math.max(...Array.from(this.dataMap.keys()));
        return maxId === -Infinity ? 1 : maxId;
    }

    cleanupOldData() {
        const scrollTop = this.container.scrollTop;
        const visibleHeight = this.container.clientHeight;
        const center = scrollTop + visibleHeight / 2;
        const centerId = Math.floor(center / this.options.rowHeight) + 1;

        const keepRange = this.options.cleanupThreshold / 3;
        const idsToRemove = [];

        for (let id of this.dataMap.keys()) {
            if (Math.abs(id - centerId) > keepRange) {
                idsToRemove.push(id);
            }
        }

        idsToRemove.forEach(id => {
            this.dataMap.delete(id);
        });

        this.updateStats();
    }

    renderVisibleRows(forceUpdate = false) {
        if (!this.tableBody || !this.scrollContainer) return;

        const scrollTop = this.scrollContainer.scrollTop;
        const visibleHeight = this.scrollContainer.clientHeight;

        const startIndex = Math.max(0, Math.floor(scrollTop / this.options.rowHeight));
        const endIndex = Math.min(
            this.totalVisibleCount - 1,
            Math.floor((scrollTop + visibleHeight) / this.options.rowHeight)
        );

        const bufferStart = Math.max(0, startIndex - this.options.buffer);
        const bufferEnd = Math.min(this.totalVisibleCount - 1, endIndex + this.options.buffer);

        if (!forceUpdate &&
            this.lastRenderStart === bufferStart &&
            this.lastRenderEnd === bufferEnd) {
            return;
        }

        this.lastRenderStart = bufferStart;
        this.lastRenderEnd = bufferEnd;

        // Очищаем только строки, не весь tableBody
        const existingRows = this.tableBody.querySelectorAll('.virtual-row');
        existingRows.forEach(row => row.remove());

        let visibleCount = 0;
        for (let i = bufferStart; i <= bufferEnd; i++) {
            const rowId = i + 1;
            const row = this.createRowForId(rowId);

            // Устанавливаем позицию
            row.style.position = 'absolute';
            row.style.top = `${i * this.options.rowHeight}px`;
            row.style.left = '0';
            row.style.width = '100%'; // Важно: 100% от родительского контейнера

            this.tableBody.appendChild(row);

            if (this.dataMap.has(rowId)) {
                visibleCount++;
            }
        }

        // Устанавливаем высоту tbody
        this.tableBody.style.height = `${this.totalVisibleCount * this.options.rowHeight}px`;
        this.tableBody.style.position = 'relative';

        this.updateVisibleStats(visibleCount, bufferStart + 1, bufferEnd + 1);
    }

    createRowForId(id) {
        const row = document.createElement('tr');
        row.className = 'virtual-row';
        row.style.height = `${this.options.rowHeight}px`;
        row.dataset.id = id;

        // Устанавливаем стили для правильного позиционирования
        row.style.display = 'block';
        row.style.position = 'absolute';
        row.style.left = '0';
        row.style.right = '0';

        if (this.dataMap.has(id)) {
            const item = this.dataMap.get(id);

            // Определяем четность строки по абсолютному ID
            const isEvenRow = id % 2 === 0;

            // Создаем контейнер для ячеек
            const cellContainer = document.createElement('div');
            cellContainer.style.display = 'flex';
            cellContainer.style.width = '100%';

            // Добавляем класс для четных строк
            if (isEvenRow) {
                row.classList.add('even-row');
            }

            this.columnDefinitions.forEach(column => {
                if (this.columnVisibility[column.key]) {
                    const cell = document.createElement('div');
                    cell.className = 'dynamic-cell';
                    cell.dataset.column = column.key;

                    // Устанавливаем ширину как у заголовка
                    const header = this.container.querySelector(`th[data-column="${column.key}"]`);
                    if (header) {
                        const rect = header.getBoundingClientRect();
                        cell.style.width = rect.width + 'px';
                        cell.style.flexShrink = '0';
                    }

                    const content = this.formatCellContent(item, column.key);
                    cell.textContent = content;
                    cell.setAttribute('data-fulltext', content);

                    // Стили для ячейки
                    cell.style.padding = '8px 4px';
                    cell.style.borderBottom = '1px solid #dee2e6';
                    cell.style.overflow = 'hidden';
                    cell.style.textOverflow = 'ellipsis';
                    cell.style.whiteSpace = 'nowrap';

                    cellContainer.appendChild(cell);
                }
            });

            // Добавляем контейнер ячеек в строку
            const tdContainer = document.createElement('td');
            tdContainer.style.padding = '0';
            tdContainer.style.border = 'none';
            tdContainer.appendChild(cellContainer);
            row.appendChild(tdContainer);

        } else {
            // Placeholder row
            row.className += ' placeholder-row';
            const td = document.createElement('td');
            td.colSpan = Object.values(this.columnVisibility).filter(v => v).length;
            td.className = 'text-center';
            td.innerHTML = `
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            Loading...
        `;
            row.appendChild(td);

            // Логика подгрузки данных
            if (!this.isLoading && !this.lastRequestedIds.has(id)) {
                setTimeout(() => {
                    if (!this.dataMap.has(id) && !this.lastRequestedIds.has(id)) {
                        const direction = id > (this.getMaxLoadedId() || 0) ? 'down' : 'up';
                        this.loadData(id, direction);
                    }
                }, 50);
            }
        }

        return row;
    }

    toggleColumn(columnKey, isVisible) {
        this.columnVisibility[columnKey] = isVisible;
        this.saveColumnState();

        // ВАЖНО: Не вызываем applyColumnVisibility сразу, а используем таймаут
        setTimeout(() => {
            this.applyColumnVisibility();
        }, 10);
    }

    forceWidthUpdate() {
        // Сбрасываем ширину контейнера
        const tableContainer = this.container.querySelector('.table-responsive');
        if (tableContainer) {
            tableContainer.style.width = 'auto';
            tableContainer.style.minWidth = '100px';
        }

        // Принудительный reflow
        this.container.offsetHeight;

        // Обновляем ширину таблицы
        this.updateTableWidth();

        // Дополнительное обновление через время
        setTimeout(() => {
            this.updatePanelWidth();
        }, 200);
    }

    getStatusClass(status) {
        const classes = {
            'Active': 'bg-success',
            'Inactive': 'bg-secondary',
            'Pending': 'bg-warning'
        };
        return classes[status] || 'bg-info';
    }

    updateStats() {
        const loadedElement = document.getElementById('stats-loaded');
        const totalElement = document.getElementById('stats-total');
        const memoryElement = document.getElementById('stats-memory');

        if (loadedElement) {
            loadedElement.textContent = `Loaded: ${this.dataMap.size}`;
        }
        if (totalElement) {
            totalElement.textContent = `Total in DB: ${this.totalCount}, Total visible: ${this.totalVisibleCount}`;
        }
        if (memoryElement) {
            memoryElement.textContent = `Memory: ${this.dataMap.size} rows`;
        }
    }

    updateVisibleStats(visibleCount, startId, endId) {
        const element = document.getElementById('stats-visible');
        if (element) {
            element.textContent = `Visible: ${visibleCount} (${startId}-${endId})`;
        }
    }

    showLoading() {
        const element = document.getElementById('loading');
        if (element) {
            element.style.display = 'block';
        }
    }

    hideLoading() {
        const element = document.getElementById('loading');
        if (element) {
            element.style.display = 'none';
        }
    }

    async navigateToValue(field, value) {
        if (!field || !value) {
            console.error('Field and value are required');
            return false;
        }

        this.showLoading();

        try {
            const searchUrl = `${this.options.apiUrl}/search?field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`;
            const response = await fetch(searchUrl);

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.target_id) {
                await this.scrollToId(result.target_id);
                return true;
            } else {
                console.log('Value not found:', result.message);
                return false;
            }

        } catch (error) {
            console.error('Search error:', error);
            return false;
        } finally {
            this.hideLoading();
        }
    }

    async scrollToId(targetId) {
        if (targetId < 1 || targetId > this.totalVisibleCount) {
            console.error(`Invalid target ID: ${targetId}`);
            return false;
        }

        const targetScrollTop = (targetId - 1) * this.options.rowHeight;

        const buffer = this.options.buffer;
        const startId = Math.max(1, targetId - buffer);
        const endId = Math.min(this.totalVisibleCount, targetId + buffer);

        let needsData = false;

        for (let id = startId; id <= endId; id++) {
            if (!this.dataMap.has(id) && !this.lastRequestedIds.has(id)) {
                needsData = true;
                break;
            }
        }

        if (needsData) {
            const loadStartId = Math.max(1, targetId - Math.floor(this.options.limit / 2));
            await this.loadData(loadStartId, 'down');

            let attempts = 0;
            while (this.isLoading && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
        }

        this.scrollContainer.scrollTop = targetScrollTop;

        setTimeout(() => {
            this.renderVisibleRows(true);
            this.updateStats();
        }, 100);

        return true;
    }

    scrollToTop() {
        this.scrollToId(1);
    }

    scrollToBottom() {
        this.scrollToId(this.totalVisibleCount);
    }

    updatePanelWidth() {
        if (!this.panelElement) {
            this.panelElement = document.querySelector('.slide-panel');
        }

        if (!this.panelElement || !this.panelElement.classList.contains('open')) {
            return;
        }

        const tableContainer = this.container.querySelector('.table-container');
        if (!tableContainer) return;

        // ВАЖНО: Даем время на обновление DOM перед измерением
        setTimeout(() => {
            // Получаем реальную ширину таблицы после обновления
            const tableRect = tableContainer.getBoundingClientRect();
            const tableWidth = tableRect.width;

            // Ограничиваем ширину: минимум 100px, максимум 50% окна
            const minWidth = 100;
            const maxWidth = Math.floor(window.innerWidth * 0.5);
            let targetWidth = Math.max(minWidth, Math.min(maxWidth, tableWidth));

            // Применяем ширину к панели
            this.panelElement.style.width = targetWidth + 'px';

            console.log('Panel width updated:', {
                tableWidth: tableWidth,
                targetWidth: targetWidth,
                minWidth: minWidth,
                maxWidth: maxWidth
            });
        }, 50); // Небольшая задержка для гарантии обновления DOM
    }
}

window.addEventListener('resize', () => {
    if (window.virtualTable) {
        setTimeout(() => {
            window.virtualTable.updatePanelWidth();
        }, 100);
    }

    if (window.slidePanel && window.slidePanel.virtualTable) {
        setTimeout(() => {
            window.slidePanel.virtualTable.updatePanelWidth();
        }, 100);
    }
});

document.addEventListener('DOMContentLoaded', function () {
    window.virtualTable = new FixedScrollbarVirtualizedTable('table-container', {
        apiUrl: '/api/table/users',
        limit: 100,
        rowHeight: 45,
        buffer: 20,
        cleanupThreshold: 400,
        preloadThreshold: 50
    });

    document.getElementById('search-button').addEventListener('click', async function () {
        const field = document.getElementById('search-field').value;
        const value = document.getElementById('search-value').value.trim();

        if (!value) {
            alert('Please enter a search value');
            return;
        }

        const success = await window.virtualTable.navigateToValue(field, value);

        if (!success) {
            alert('Value not found or search failed');
        }
    });

    document.getElementById('search-value').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('search-button').click();
        }
    });

    document.getElementById('go-to-id-button').addEventListener('click', function () {
        const targetId = parseInt(document.getElementById('go-to-id').value);

        if (isNaN(targetId) || targetId < 1 || targetId > 10000) {
            alert('Please enter a valid ID between 1 and 10000');
            return;
        }

        window.virtualTable.scrollToId(targetId);
    });

    document.getElementById('go-to-id').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('go-to-id-button').click();
        }
    });

    document.querySelectorAll('.column-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const columnKey = this.dataset.column;
            const isVisible = this.checked;

            // Используем forceWidthUpdate для гарантированного обновления
            window.virtualTable.toggleColumn(columnKey, isVisible);
            setTimeout(() => {
                window.virtualTable.forceWidthUpdate();
            }, 100);
        });
    });

    document.getElementById('reset-columns').addEventListener('click', function () {
        window.virtualTable.resetColumns();
    });

    document.addEventListener('transitionend', function (e) {
        if (e.target.classList.contains('slide-panel') &&
            e.propertyName === 'right' &&
            window.virtualTable) {
            // После завершения анимации открытия панели обновляем ширину
            setTimeout(() => {
                window.virtualTable.forceWidthUpdate();
            }, 100);
        }
    });

});


class TableControls {
    constructor() {
        this.controlsPanel = document.getElementById('controls-panel');
        this.tableWrapper = document.getElementById('table-wrapper');
        this.toggleBtn = document.getElementById('toggle-controls');
        this.externalToggleBtn = document.getElementById('external-toggle-controls');
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.controls-content');

        this.isPanelOpen = false;
        this.currentTab = 'search';

        this.init();
    }

    init() {
        // Скрываем кнопку внутри панели изначально
        this.toggleBtn.style.display = 'none';

        // Обработчики событий
        this.externalToggleBtn.addEventListener('click', () => this.openPanel());
        this.toggleBtn.addEventListener('click', () => this.closePanel());

        // Обработчики вкладок
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Закрытие по ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isPanelOpen) {
                this.closePanel();
            }
        });

        this.loadPanelState();
    }

    openPanel() {
        this.isPanelOpen = true;
        this.controlsPanel.classList.add('open');
        this.tableWrapper.classList.add('with-panel');

        // Показываем кнопку закрытия внутри панели
        this.toggleBtn.style.display = 'block';
        // Скрываем внешнюю кнопку
        this.externalToggleBtn.style.display = 'none';

        this.savePanelState(true);
    }

    closePanel() {
        this.isPanelOpen = false;
        this.controlsPanel.classList.remove('open');
        this.tableWrapper.classList.remove('with-panel');

        // Скрываем кнопку внутри панели
        this.toggleBtn.style.display = 'none';
        // Показываем внешнюю кнопку
        this.externalToggleBtn.style.display = 'block';

        this.savePanelState(false);
    }

    switchTab(tabName) {
        // Деактивируем все вкладки
        this.tabBtns.forEach(btn => btn.classList.remove('active'));
        this.tabContents.forEach(content => content.classList.remove('active'));

        // Активируем выбранную вкладку
        const activeTabBtn = document.querySelector(`[data-tab="${tabName}"]`);
        const activeTabContent = document.getElementById(`tab-${tabName}`);

        if (activeTabBtn && activeTabContent) {
            activeTabBtn.classList.add('active');
            activeTabContent.classList.add('active');
            this.currentTab = tabName;
        }
    }

    savePanelState(isOpen) {
        try {
            localStorage.setItem('tableControlsOpen', isOpen.toString());
            localStorage.setItem('tableCurrentTab', this.currentTab);
        } catch (e) {
            console.error('Error saving panel state:', e);
        }
    }

    loadPanelState() {
        try {
            const savedState = localStorage.getItem('tableControlsOpen');
            const savedTab = localStorage.getItem('tableCurrentTab');

            if (savedState === 'true') {
                this.openPanel();
            }

            if (savedTab) {
                this.switchTab(savedTab);
            }
        } catch (e) {
            console.error('Error loading panel state:', e);
        }
    }
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', function () {
    window.tableControls = new TableControls();
});