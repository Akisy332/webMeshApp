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

        // кэш последних запросов по направлениям
        this.lastDownStartId = -1;
        this.lastUpStartId = -1;
        this.requestCooldown = 200; // ms между одинаковыми запросами

        this.dataMap = new Map();
        this.totalCount = 10000;
        this.totalVisibleCount = 10000;
        this.isLoading = false;
        this.hasMoreUp = true;
        this.hasMoreDown = true;

        this.currentSessionId = currentSessionId;

        this.pendingRequests = new Set();
        this.lastRequestedIds = new Set();

        this.pendingScrollRequests = new Set();
        this.scrollRenderTimeout = null;

        this.lastScrollTop = 0;
        this.scrollThrottle = null;
        this.forceCheckTimeout = null;

        // Кэш для хранения информации о ID и времени
        this.datetimeIndex = new Map(); // datetime_unix -> id
        this.idDatetimeMap = new Map(); // id -> datetime_unix
        this.lastKnownRanges = new Map(); // Хранит диапазоны ID вокруг запросов

        // Минимальный интервал между запросами для одного datetime
        this.datetimeRequestCache = new Map();

        // Throttle система
        this.pendingDatetimeRequest = null;
        this.lastDatetimeRequestTime = 0;
        this.datetimeRequestThrottle = 400; // ms

        // Throttle для scroll
        this.lastScrollRequestTime = 0;
        this.pendingScrollId = null;
        this.pendingScrollNeedsLoad = false;
        this.scrollThrottleTimeout = null;

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

    init() {
        this.createTableStructure();
        this.setupScrollbar();
        this.setupScrollListener();
        this.loadInitialData();
        this.setupColumnToggles();
        this.initEvents();
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

    ////////////////////////
    /* Управление данными */
    ////////////////////////

    async loadInitialData() {
        await this.loadData(1, 'down');
        this.renderVisibleRows(true);
    }

    async loadData(startId, direction) {
        const requestKey = `${direction}-${startId}`;

        if (direction === 'down' && startId === this.lastDownStartId) {
            console.log('Skipping duplicate down request:', startId);
            return;
        }
        if (direction === 'up' && startId === this.lastUpStartId) {
            console.log('Skipping duplicate up request:', startId);
            return;
        }

        // console.log('Attempting to load:', { startId, direction, pending: this.pendingRequests.has(requestKey), lastRequested: this.lastRequestedIds.has(startId) });

        if (this.pendingRequests.has(requestKey) || this.lastRequestedIds.has(startId)) {
            console.log('Skipping duplicate request:', requestKey);
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

        if (direction === 'down') {
            startId--;
            this.lastDownStartId = startId;
        } else {
            this.lastUpStartId = startId;
        }

        this.showLoading();

        try {

            const sessionId = this.currentSessionId;
            const moduleIds = [];

            // Преобразуем массив в строку через запятую
            const moduleIdsString = moduleIds.join(',');

            const url = `${this.options.apiUrl}?id_session=${sessionId}&modules=${moduleIdsString}&limit=${this.options.limit}&offset=${startId}&direction=${direction}`;
            const response = await fetch(url);
            const result = await response.json();

            if (response.ok) {
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

        // Автоматически обновляем кэш при получении новых данных
        this.updateDatetimeCache(result.data);

        let newDataCount = 0;
        let existingDataCount = 0;

        result.data.forEach(data => {
            if (!this.dataMap.has(data.id)) {
                this.dataMap.set(data.id, data);
                newDataCount++;
            } else {
                existingDataCount++;
            }
        });

        console.log(`Processed ${result.data.length} items: ${newDataCount} new, ${existingDataCount} existing, direction: ${direction}`);

        // Обновляем отображение только если есть новые данные
        if (newDataCount > 0) {
            this.updateStats();
            this.renderVisibleRows(true);
        }

        setTimeout(() => {
            if (!this.isLoading) {
                this.checkForMoreData();
            }
        }, 200);
    }

    clearTableData() {
        // Останавливаем текущие загрузки
        this.isLoading = false;

        // Очищаем кэш datetime
        this.datetimeIndex.clear();
        this.idDatetimeMap.clear();
        this.lastKnownRanges.clear();
        this.datetimeRequestCache.clear();

        // Очищаем throttle систему
        if (this.pendingDatetimeRequest) {
            clearTimeout(this.pendingDatetimeRequest);
            this.pendingDatetimeRequest = null;
        }
        if (this.scrollThrottleTimeout) {
            clearTimeout(this.scrollThrottleTimeout);
            this.scrollThrottleTimeout = null;
        }
        this.pendingScrollId = null;
        this.lastDatetimeRequestTime = 0;
        this.lastScrollRequestTime = 0;

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

    cleanupOldData() {
        if (this.dataMap.size <= this.options.cleanupThreshold) {
            return; // Не очищаем если данных немного
        }

        const scrollTop = this.scrollContainer.scrollTop;
        const visibleHeight = this.scrollContainer.clientHeight;
        const visibleStartId = Math.max(1, Math.floor(scrollTop / this.options.rowHeight) + 1);
        const visibleEndId = Math.min(this.totalVisibleCount, Math.floor((scrollTop + visibleHeight) / this.options.rowHeight) + 1);

        // Увеличиваем буфер сохранения
        const keepBuffer = this.options.cleanupThreshold / 2; // 100 строк вместо 66
        const keepStartId = Math.max(1, visibleStartId - keepBuffer);
        const keepEndId = Math.min(this.totalVisibleCount, visibleEndId + keepBuffer);

        const idsToRemove = [];

        // Удаляем ТОЛЬКО данные далеко за пределами видимой области
        for (let id of this.dataMap.keys()) {
            if (id < keepStartId || id > keepEndId) {
                idsToRemove.push(id);
            }
        }

        // Ограничиваем количество удаляемых строк за раз
        const maxRemovePerCleanup = 100;
        if (idsToRemove.length > maxRemovePerCleanup) {
            // Удаляем самые дальние ID сначала
            idsToRemove.sort((a, b) => {
                const distA = Math.min(Math.abs(a - keepStartId), Math.abs(a - keepEndId));
                const distB = Math.min(Math.abs(b - keepStartId), Math.abs(b - keepEndId));
                return distB - distA; // Сначала самые дальние
            });
            idsToRemove.splice(maxRemovePerCleanup);
        }

        console.log(`Cleaning up ${idsToRemove.length} old rows, keeping ${keepStartId}-${keepEndId}`);

        idsToRemove.forEach(id => {
            this.dataMap.delete(id);
        });

        this.updateStats();
    }

    updateDatetimeCache(dataArray) {
        if (!dataArray || !Array.isArray(dataArray)) return;

        dataArray.forEach(item => {
            if (item.id && item.datetime_unix) {
                const datetime = parseInt(item.datetime_unix);
                const id = parseInt(item.id);

                // Проверяем, есть ли уже такой datetime в мапе
                if (this.datetimeIndex.has(datetime)) {
                    // Если есть, сравниваем id и оставляем меньший
                    const existingId = this.datetimeIndex.get(datetime);
                    if (id < existingId) {
                        this.datetimeIndex.set(datetime, id);
                        // Обновляем также обратную мапу
                        this.idDatetimeMap.delete(existingId);
                        this.idDatetimeMap.set(id, datetime);
                    }
                } else {
                    // Если datetime еще нет в мапе, просто добавляем
                    this.datetimeIndex.set(datetime, id);
                    this.idDatetimeMap.set(id, datetime);
                }
            }
        });
        // Ограничиваем размер кэша
        // if (this.datetimeIndex.size > 1000) {
        //     const keys = Array.from(this.datetimeIndex.keys()).sort();
        //     const toRemove = keys.slice(0, keys.length - 800); // Оставляем 800 последних
        //     toRemove.forEach(key => {
        //         const id = this.datetimeIndex.get(key);
        //         this.datetimeIndex.delete(key);
        //         this.idDatetimeMap.delete(id);
        //     });
        // }
    }

    ////////////////////////
    /* Навигация и поиск  */
    ////////////////////////

    async navigateToDatetimeUnix(datetime_unix) {
        if (!datetime_unix) {
            console.error('datetime_unix is required');
            return false;
        }

        // 1. Throttle - отменяем предыдущий ожидающий запрос
        const requestTime = Date.now();
        if (this.pendingDatetimeRequest) {
            console.log('Cancelling previous datetime request for new one:', datetime_unix);
            clearTimeout(this.pendingDatetimeRequest);
            this.pendingDatetimeRequest = null;
        }

        // 2. Проверяем минимальный интервал между запросами
        const timeSinceLastRequest = requestTime - this.lastDatetimeRequestTime;
        if (timeSinceLastRequest < this.datetimeRequestThrottle) {
            console.log('Throttling datetime request:', datetime_unix, 'time since last:', timeSinceLastRequest);

            // Сохраняем только последний запрос
            return new Promise((resolve) => {
                this.pendingDatetimeRequest = setTimeout(async () => {
                    this.pendingDatetimeRequest = null;
                    this.lastDatetimeRequestTime = Date.now();
                    const result = await this.executeDatetimeNavigation(datetime_unix);
                    resolve(result);
                }, this.datetimeRequestThrottle - timeSinceLastRequest);
            });
        }

        // 3. Выполняем запрос сразу
        this.lastDatetimeRequestTime = requestTime;
        return this.executeDatetimeNavigation(datetime_unix);
    }

    async executeDatetimeNavigation(datetime_unix) {
        this.showLoading();

        try {
            // Преобразуем в число для consistency
            const targetDatetime = parseInt(datetime_unix);

            // 1. Проверяем кэш - ищем точное или ближайшее совпадение
            const cachedTargetId = this.findClosestIdByDatetime(targetDatetime);

            if (cachedTargetId && this.isDataAvailableAround(cachedTargetId)) {
                console.log('Using cached data for datetime:', targetDatetime, 'targetId:', cachedTargetId);
                await this.scrollToId(cachedTargetId, false);
                return true;
            }

            // 2. Если в кэше нет подходящих данных, запрашиваем у сервера
            const sessionId = this.currentSessionId;
            const moduleIds = [];
            const moduleIdsString = moduleIds.join(',');
            const direction = 'down';

            const url = `${this.options.apiUrl}/datetime?id_session=${sessionId}&modules=${moduleIdsString}&limit=${this.options.limit}&datetime=${targetDatetime}&direction=${direction}`;

            console.log('Executing datetime request:', targetDatetime);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Search UNIX datetime failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('Datetime search result:', result);

            if (result.success && result.target_id) {
                // 3. Сохраняем полученные данные в кэш
                this.updateDatetimeCache(result.data || []);

                // 4. Проверяем, удовлетворяет ли найденный ID нашим требованиям
                const finalTargetId = this.validateAndFindBestTargetId(result.target_id, targetDatetime, result.data);

                console.log('Final target ID for datetime', targetDatetime, ':', finalTargetId);
                await this.scrollToId(finalTargetId, true);
                return true;
            } else {
                console.log('Value not found:', result);
                return false;
            }

        } catch (error) {
            console.error('Search error:', error);
            return false;
        } finally {
            this.hideLoading();
        }
    }

    async navigateToValue(field, value) {
        this.navigateToDatetimeUnix(1756281949);

        if (!field || !value) {
            console.error('Field and value are required');
            return false;
        }

        // this.showLoading();

        // try {
        //     const searchUrl = `${this.options.apiUrl}/search?field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`;
        //     const response = await fetch(searchUrl);

        //     if (!response.ok) {
        //         throw new Error(`Search failed: ${response.status}`);
        //     }

        //     const result = await response.json();

        //     if (result.success && result.target_id) {
        //         await this.scrollToId(result.target_id);
        //         return true;
        //     } else {
        //         console.log('Value not found:', result.message);
        //         return false;
        //     }

        // } catch (error) {
        //     console.error('Search error:', error);
        //     return false;
        // } finally {
        //     this.hideLoading();
        // }
    }

    // Поиск ближайшего ID по datetime_unix в кэше
    findClosestIdByDatetime(targetDatetime) {
        let closestId = null;
        let minDiff = Infinity;

        // Ищем точное совпадение
        if (this.datetimeIndex.has(targetDatetime)) {
            return this.datetimeIndex.get(targetDatetime);
        }

        // Ищем ближайшее значение (<= targetDatetime)
        for (const [datetime, id] of this.datetimeIndex) {
            const diff = targetDatetime - datetime;
            if (diff >= 0 && diff < minDiff) {
                minDiff = diff;
                closestId = id;
            }
        }

        // Если не нашли <=, ищем любое ближайшее
        if (!closestId) {
            for (const [datetime, id] of this.datetimeIndex) {
                const diff = Math.abs(targetDatetime - datetime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestId = id;
                }
            }
        }

        return closestId;
    }

    // Валидируем и находим лучший targetId
    validateAndFindBestTargetId(serverTargetId, targetDatetime, serverData) {
        // Если сервер прислал данные, обновляем кэш
        if (serverData && Array.isArray(serverData)) {
            this.updateDatetimeCache(serverData);
        }

        // Проверяем, есть ли у нас точное совпадение по datetime
        const exactMatchId = this.datetimeIndex.get(targetDatetime);
        if (exactMatchId) {
            return exactMatchId;
        }

        // Ищем ближайший ID с datetime <= targetDatetime
        let bestId = serverTargetId;
        let bestDiff = targetDatetime - (this.idDatetimeMap.get(serverTargetId) || 0);

        if (serverData) {
            serverData.forEach(item => {
                if (item.id && item.datetime_unix) {
                    const datetime = parseInt(item.datetime_unix);
                    const diff = targetDatetime - datetime;

                    // Предпочитаем записи с datetime <= targetDatetime
                    if (diff >= 0 && (bestDiff < 0 || diff < bestDiff)) {
                        bestDiff = diff;
                        bestId = item.id;
                    }
                }
            });
        }

        // Если не нашли подходящую запись, используем серверный targetId
        if (bestDiff < 0) {
            console.log('No suitable record found with datetime <=', targetDatetime, 'using server target:', serverTargetId);
            return serverTargetId;
        }

        console.log('Found best match for datetime', targetDatetime, 'id:', bestId, 'time diff:', bestDiff);
        return bestId;
    }

    // Проверяем, доступны ли данные вокруг указанного ID
    isDataAvailableAround(targetId, buffer = 10) {
        if (!this.dataMap.has(targetId)) {
            return false;
        }

        // Проверяем наличие соседних ID в небольшом радиусе
        const startId = Math.max(1, targetId - buffer);
        const endId = Math.min(this.totalVisibleCount, targetId + buffer);

        let availableCount = 0;
        for (let id = startId; id <= endId; id++) {
            if (this.dataMap.has(id)) {
                availableCount++;
            }
        }

        // Считаем данные доступными если есть хотя бы 50% в буфере
        const availabilityRatio = availableCount / (endId - startId + 1);
        return availabilityRatio > 0.5;
    }

    //////////////////////////////////
    /* Скроллинг и позиционирование */
    //////////////////////////////////

    async scrollToId(targetId, needsLoadData = true) {
        if (targetId < 1 || targetId > this.totalVisibleCount) {
            console.error(`Invalid target ID: ${targetId}`);
            return false;
        }

        // Throttle для scroll запросов
        const now = Date.now();
        if (this.lastScrollRequestTime && now - this.lastScrollRequestTime < 200) {
            console.log('Throttling scroll request:', targetId);
            // Сохраняем только последний целевой ID
            this.pendingScrollId = targetId;
            this.pendingScrollNeedsLoad = needsLoadData;

            if (!this.scrollThrottleTimeout) {
                this.scrollThrottleTimeout = setTimeout(async () => {
                    if (this.pendingScrollId) {
                        const id = this.pendingScrollId;
                        const needsLoad = this.pendingScrollNeedsLoad;
                        this.pendingScrollId = null;
                        this.pendingScrollNeedsLoad = false;
                        this.scrollThrottleTimeout = null;
                        await this.executeScrollToId(id, needsLoad);
                    }
                }, 200);
            }
            return false;
        }

        this.lastScrollRequestTime = now;
        return this.executeScrollToId(targetId, needsLoadData);
    }

    async executeScrollToId(targetId, needsLoadData = true) {
        // Кэширование последних запросов для избежания дублирования
        const requestKey = `scroll_${targetId}`;
        if (this.pendingScrollRequests && this.pendingScrollRequests.has(requestKey)) {
            console.log('Scroll request already in progress:', targetId);
            return false;
        }

        // Инициализация при первом вызове
        if (!this.pendingScrollRequests) {
            this.pendingScrollRequests = new Set();
        }
        this.pendingScrollRequests.add(requestKey);

        try {
            const targetScrollTop = (targetId - 1) * this.options.rowHeight;

            // Проверяем, находится ли targetId уже в видимой области
            const currentScrollTop = this.scrollContainer.scrollTop;
            const visibleHeight = this.scrollContainer.clientHeight;
            const currentStartId = Math.floor(currentScrollTop / this.options.rowHeight) + 1;
            const currentEndId = Math.floor((currentScrollTop + visibleHeight) / this.options.rowHeight) + 1;

            if (targetId >= currentStartId && targetId <= currentEndId) {
                console.log('Target ID already in visible area, no scroll needed');
                this.scrollContainer.scrollTop = targetScrollTop;
                setTimeout(() => {
                    this.renderVisibleRows(true);
                }, 50);
                return true;
            }

            const buffer = this.options.buffer;
            const startId = Math.max(1, targetId - buffer);
            const endId = Math.min(this.totalVisibleCount, targetId + buffer);

            let needsData = false;

            if (needsLoadData) {
                // Умная проверка буфера: считаем только критические пропуски
                let criticalMissingCount = 0;
                const criticalIds = [
                    targetId, // Сам targetId всегда критичен
                    targetId - 1, targetId + 1, // Соседние строки
                    Math.max(1, targetId - 5), // Небольшой буфер сверху
                    Math.min(this.totalVisibleCount, targetId + 5) // Небольшой буфер снизу
                ];

                // Проверяем только критические ID
                for (const id of criticalIds) {
                    if (id >= 1 && id <= this.totalVisibleCount) {
                        if (!this.dataMap.has(id) && !this.lastRequestedIds.has(id)) {
                            criticalMissingCount++;
                        }
                    }
                }

                // Загружаем только если отсутствуют критические данные
                needsData = criticalMissingCount > 0;

                if (needsData) {
                    // Оптимизация загрузки - грузим с умным offset
                    const loadStartId = Math.max(1, targetId - Math.floor(this.options.limit / 3));

                    // Дополнительная проверка - не запрашиваем то, что уже загружается
                    if (!this.lastRequestedIds.has(loadStartId)) {
                        await this.loadData(loadStartId, 'down');

                        // Сокращенное ожидание с приоритетной проверкой
                        let attempts = 0;
                        const maxAttempts = 20;

                        while (this.isLoading && attempts < maxAttempts) {
                            // Приоритетная проверка - если появились критические данные, выходим раньше
                            let hasCriticalData = true;
                            for (const id of criticalIds) {
                                if (!this.dataMap.has(id)) {
                                    hasCriticalData = false;
                                    break;
                                }
                            }

                            if (hasCriticalData) {
                                break;
                            }

                            await new Promise(resolve => setTimeout(resolve, 100));
                            attempts++;
                        }
                    }
                }
            }

            // Прокрутка
            this.scrollContainer.scrollTop = targetScrollTop;

            // Отложенный рендеринг для батчинга
            clearTimeout(this.scrollRenderTimeout);
            this.scrollRenderTimeout = setTimeout(() => {
                this.renderVisibleRows(true);
                this.updateStats();
            }, 50);

            return true;

        } catch (error) {
            console.error('Scroll to ID failed:', error);
            return false;
        } finally {
            // Очищаем флаг запроса с задержкой чтобы предотвратить rapid-fire запросы
            setTimeout(() => {
                if (this.pendingScrollRequests) {
                    this.pendingScrollRequests.delete(requestKey);
                }
            }, 500);
        }
    }

    scrollToTop() {
        this.scrollToId(1);
    }

    scrollToBottom() {
        this.scrollToId(this.totalVisibleCount);
    }

    handleScroll() {
        const currentScrollTop = this.scrollContainer.scrollTop;
        const scrollDelta = Math.abs(currentScrollTop - this.lastScrollTop);

        // Определяем и сохраняем направление скролла
        // this.scrollDirection = currentScrollTop > this.lastScrollTop ? 'down' : 'up';

        if (scrollDelta > this.options.rowHeight * 20) {
            this.forceCheckData();
        }

        this.lastScrollTop = currentScrollTop;

        if (this.scrollThrottle) {
            clearTimeout(this.scrollThrottle);
        }

        this.scrollThrottle = setTimeout(() => {
            this.renderVisibleRows();
            this.checkForMoreData();
        }, 10);
    }

    checkForMoreData() {
        const scrollTop = this.scrollContainer.scrollTop;
        const visibleHeight = this.scrollContainer.clientHeight;
        const visibleStartId = Math.max(1, Math.floor(scrollTop / this.options.rowHeight) + 1);
        const visibleEndId = Math.min(this.totalVisibleCount, Math.floor((scrollTop + visibleHeight) / this.options.rowHeight) + 1);

        // Проверка для загрузки вниз
        if (this.hasMoreDown !== false) {
            const maxLoadedId = this.getMaxLoadedId();
            const distanceToBottom = this.totalVisibleCount - visibleEndId;

            if (distanceToBottom < this.options.preloadThreshold &&
                visibleEndId > maxLoadedId - this.options.preloadThreshold) {

                const nextStartId = maxLoadedId + 1;

                if (nextStartId <= this.totalVisibleCount &&
                    !this.isLoading &&
                    !this.lastRequestedIds.has(nextStartId)) {

                    this.loadData(nextStartId, 'down');
                }
            }
        }

        if (this.hasMoreUp !== false) {
            const minLoadedId = this.getMinLoadedId();
            const distanceToTop = visibleStartId - 1;

            if (distanceToTop < this.options.preloadThreshold &&
                visibleStartId < minLoadedId + this.options.preloadThreshold) {

                const nextStartId = Math.max(1, minLoadedId - this.options.limit);

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
        console.log("forceCheckData")
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

            if (loadStartId < minLoadedId) {
                // Для скролла вверх
                const nextStartId = Math.max(1, minLoadedId - this.options.limit);
                if (!this.isLoading && !this.lastRequestedIds.has(nextStartId)) {
                    this.loadData(nextStartId, 'up');
                }
            } else if (loadStartId > maxLoadedId) {
                // Для скролла вниз
                if (!this.isLoading && !this.lastRequestedIds.has(loadStartId)) {
                    this.loadData(loadStartId, 'down');
                }
            }
        }

        this.checkBoundariesConservatively(visibleStartId, visibleEndId);
    }

    checkBoundariesConservatively(visibleStartId, visibleEndId) {
        const minLoadedId = this.getMinLoadedId();
        const maxLoadedId = this.getMaxLoadedId();

        // Для верхней границы
        if (visibleStartId < minLoadedId && this.hasMoreUp !== false) {
            const missingTopCount = minLoadedId - visibleStartId;
            if (missingTopCount > this.options.preloadThreshold * 2) {

                const nextStartId = Math.max(1, minLoadedId - this.options.limit);
                if (!this.isLoading && !this.lastRequestedIds.has(nextStartId)) {
                    this.loadData(nextStartId, 'up');
                }
            }
        }

        // Для нижней границы
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

    ///////////////////////
    /* Рендеринг таблицы */
    ///////////////////////

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

                const sampleWidth = this.calculateColumnWidth(column);
                th.style.width = sampleWidth + 'px';
                th.style.minWidth = sampleWidth + 'px';

                headerRow.appendChild(th);
            }
        });

        this.updateTableWidth();
    }

    createTableStructure() {
        this.container.innerHTML = `
        <div class="table-responsive" id="scroll-container">
            <div id="scroll-content"></div>
            <table class="table table-hover mb-0 dynamic-width">
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

    updateScrollbarSize() {
        const totalHeight = this.totalVisibleCount * this.options.rowHeight;
        this.scrollContent.style.height = `${totalHeight}px`;
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

        // Собираем ID строк, которые должны быть отображены
        const neededIds = new Set();
        for (let i = bufferStart; i <= bufferEnd; i++) {
            neededIds.add(i + 1);
        }

        // Удаляем только те строки, которые больше не нужны
        const existingRows = this.tableBody.querySelectorAll('.virtual-row');
        existingRows.forEach(row => {
            const rowId = parseInt(row.dataset.id);
            if (!neededIds.has(rowId)) {
                row.remove();
            }
        });

        // Добавляем или обновляем нужные строки
        let visibleCount = 0;
        for (let i = bufferStart; i <= bufferEnd; i++) {
            const rowId = i + 1;
            let row = this.tableBody.querySelector(`.virtual-row[data-id="${rowId}"]`);

            if (!row) {
                // Создаем новую строку только если ее нет
                row = this.createRowForId(rowId);
                row.style.position = 'absolute';
                row.style.top = `${i * this.options.rowHeight}px`;
                row.style.left = '0';
                row.style.width = '100%';
                this.tableBody.appendChild(row);
            } else {
                // Обновляем позицию существующей строки
                row.style.top = `${i * this.options.rowHeight}px`;

                // Если данные появились для placeholder строки, пересоздаем ее
                if (row.classList.contains('placeholder-row') && this.dataMap.has(rowId)) {
                    row.remove();
                    row = this.createRowForId(rowId);
                    row.style.position = 'absolute';
                    row.style.top = `${i * this.options.rowHeight}px`;
                    row.style.left = '0';
                    row.style.width = '100%';
                    this.tableBody.appendChild(row);
                }
            }

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
        // Проверяем, существует ли уже строка с этим ID в DOM
        const existingRow = this.tableBody.querySelector(`.virtual-row[data-id="${id}"]`);
        if (existingRow && this.dataMap.has(id)) {
            // Если строка уже существует и данные есть, возвращаем существующую строку
            return existingRow;
        }

        const row = document.createElement('tr');
        row.className = 'virtual-row';
        row.style.height = `${this.options.rowHeight}px`;
        row.dataset.id = id;

        row.addEventListener('click', (event) => {
            // Проверяем, что клик был левой кнопкой мыши (ЛКМ)
            if (event.button === 0) {
                if (this.dataMap.has(id)) {
                    const item = this.dataMap.get(id);
                    eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_SET, item.datetime_unix);
                }
            }
        });

        // Устанавливаем стили для правильного позиционирования
        row.style.display = 'block';
        row.style.position = 'absolute';
        row.style.left = '0';
        row.style.right = '0';

        // Проверяем наличие данных ДО создания строки
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
            // Placeholder row - только если данных нет
            row.className += ' placeholder-row';
            const td = document.createElement('td');
            td.colSpan = Object.values(this.columnVisibility).filter(v => v).length;
            td.className = 'text-center';
            td.innerHTML = `
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            Loading...
        `;
            row.appendChild(td);

            // Логика подгрузки данных - только если данных нет и не загружается
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

    //////////////////////////
    /* Управление колонками */
    //////////////////////////

    setupColumnToggles() {
        this.loadColumnState();
        this.renderColumnToggles();
        this.applyColumnVisibility();
    }

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

    toggleColumn(columnKey, isVisible) {
        this.columnVisibility[columnKey] = isVisible;
        this.saveColumnState();

        // Не вызываем applyColumnVisibility сразу, а используем таймаут
        setTimeout(() => {
            this.applyColumnVisibility();
        }, 10);
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

    ///////////////////////////
    /* Форматирование данных */
    ///////////////////////////

    formatCellContent(item, columnKey) {
        switch (columnKey) {
            case 'id':
                return item.id.toString();
            case 'module_id':
                return item.module_id.toString();
            case 'module_name':
                return item.module_name;
            case 'datetime_unix':
                return this.unixToLocalTime(item.datetime_unix.toString());
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

    unixToLocalTime(unixTimestamp) {
        // Убедимся, что timestamp в миллисекундах (если приходит в секундах, умножаем на 1000)
        const timestamp = unixTimestamp.toString().length <= 10 ? unixTimestamp * 1000 : unixTimestamp;
        const date = new Date(timestamp);
        return date.toLocaleString();
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

    /////////////////////////////
    /* Управление DOM и layout */
    /////////////////////////////

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

            // Добавляем отступ для scrollbar
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

    ////////////////////////////
    /* Вспомогательные методы */
    ////////////////////////////

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

    /////////////////////////
    /* Обработчики событий */
    /////////////////////////

    setupScrollListener() {
        let scrollTimeout;
        this.handleScroll = this.handleScroll.bind(this);

        this.scrollContainer.addEventListener('scroll', () => {
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }

            scrollTimeout = setTimeout(() => {
                this.handleScroll();
            }, 16);
        });
    }

    setupScrollbar() {
        this.updateScrollbarSize();
    }

    initEvents() {
        // eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data) => {
        // 
        // });

        // Подписка на событие очистки таблицы
        eventBus.on(EventTypes.TABLE.CLEAR, this.clearTableData);

        // Подписка на событие загрузки новой сессии
        eventBus.on(EventTypes.SESSION.SELECTED, (session) => {
            this.clearTableData();
            this.currentSessionId = session.id;
            this.loadInitialData();
        });

        eventBus.on(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, currentUnixTime => {
            this.navigateToDatetimeUnix(currentUnixTime);
        });
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