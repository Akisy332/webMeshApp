class SlidePanel {
    constructor() {
        this.panel = document.getElementById('slidePanel');
        this.toggleBtn = document.getElementById('togglePanel');
        this.isOpen = false;
        this.isTableLoaded = false;
        this.virtualTable = null;
        this.tableControls = null;

        this.init();
    }

    init() {
        this.toggleBtn.addEventListener('click', () => this.toggle());

        // Закрытие по ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.isOpen = true;
        this.panel.classList.add('open');
        document.body.style.overflow = 'hidden';

        if (!this.isTableLoaded) {
            this.loadTable();
        } else if (this.virtualTable) {
            // Если таблица уже загружена, обновляем ширину
            setTimeout(() => {
                this.virtualTable.updatePanelWidth();
            }, 50);
        }
    }

    close() {
        this.isOpen = false;
        this.panel.classList.remove('open');
        document.body.style.overflow = '';
    }

    async loadTable() {
        const tableContent = document.getElementById('table-content');

        if (!this.isTableLoaded) {
            tableContent.innerHTML = `
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Загрузка...</span>
                        </div>
                        <p class="mt-2">Загрузка таблицы...</p>
                    </div>
                `;
        }

        try {
            const response = await fetch('/table');
            if (response.ok) {
                const html = await response.text();
                tableContent.innerHTML = html;
                this.isTableLoaded = true;

                // Инициализируем таблицу после загрузки DOM
                setTimeout(() => {
                    this.initializeTableAndControls();
                }, 100);
            } else {
                throw new Error('Failed to load table: ' + response.status);
            }
        } catch (error) {
            console.error('Error loading table:', error);
            tableContent.innerHTML = `
                    <div class="alert alert-danger">
                        <h5>Ошибка загрузки таблицы</h5>
                        <p>${error.message}</p>
                        <button class="btn btn-primary" onclick="slidePanel.loadTable()">Попробовать снова</button>
                    </div>
                `;
        }
    }

    initializeTableAndControls() {
        const tableContainer = document.querySelector('#table-content #table-container');
        if (!tableContainer) {
            console.error('Table container not found');
            return;
        }

        // Устанавливаем правильную высоту
        tableContainer.style.height = '100%';
        tableContainer.style.display = 'flex';
        tableContainer.style.flexDirection = 'column';

        // Удаляем старый экземпляр таблицы если существует
        if (this.virtualTable) {
            this.virtualTable.destroy();
        }

        // Создаем новый экземпляр таблицы
        this.virtualTable = new FixedScrollbarVirtualizedTable('table-container', {
            apiUrl: '/api/table/users',
            limit: 100,
            rowHeight: 45,
            buffer: 20,
            cleanupThreshold: 400,
            preloadThreshold: 50
        });

        // Сохраняем ссылку на элемент панели
        this.virtualTable.panelElement = this.panel;

        // Принудительно обновляем размеры
        setTimeout(() => {
            if (this.virtualTable) {
                this.virtualTable.updateTableWidth();
                this.virtualTable.updateScrollbarSize();
                this.virtualTable.renderVisibleRows(true);
                this.virtualTable.updatePanelWidth(); // Добавлен вызов обновления ширины панели
            }
        }, 200);

        this.initializeTableControls();
    }

    initializeTableControls() {
        // Убедимся, что элементы управления существуют
        const controlsPanel = document.querySelector('#table-content #controls-panel');
        const tableWrapper = document.querySelector('#table-content #table-wrapper');

        if (!controlsPanel || !tableWrapper) {
            console.error('Control elements not found in loaded table');
            return;
        }

        // Создаем внешнюю кнопку для открытия панели управления
        this.createExternalToggleButton();

        // Настраиваем обработчики событий для вкладок
        this.setupTabHandlers();

        // Настраиваем обработчики для элементов управления
        this.setupControlHandlers();
    }

    createExternalToggleButton() {
        // Удаляем старую кнопку если существует
        const oldButton = document.querySelector('#table-content #external-toggle-controls');
        if (oldButton) {
            oldButton.remove();
        }

        // Создаем компактную кнопку
        const externalToggle = document.createElement('button');
        externalToggle.className = 'btn btn-outline-primary btn-sm compact-toggle-btn';
        externalToggle.id = 'external-toggle-controls';
        externalToggle.title = 'Управление таблицей';
        externalToggle.innerHTML = '<i class="fas fa-cog"></i>';

        // Вставляем в header-controls
        const headerControls = document.querySelector('#table-content .header-controls');
        if (headerControls) {
            headerControls.appendChild(externalToggle);

            // Обработчик для кнопки
            externalToggle.addEventListener('click', () => this.openControlsPanel());
        }
    }

    openControlsPanel() {
        const controlsPanel = document.querySelector('#table-content #controls-panel');
        const tableWrapper = document.querySelector('#table-content #table-wrapper');
        const toggleBtn = document.querySelector('#table-content #toggle-controls');
        const externalToggle = document.querySelector('#table-content #external-toggle-controls');

        if (controlsPanel && tableWrapper) {
            controlsPanel.classList.add('open');
            tableWrapper.classList.add('with-panel');

            if (toggleBtn) {
                toggleBtn.style.display = 'block';
                toggleBtn.innerHTML = '<i class="fas fa-times"></i>';
            }

            if (externalToggle) {
                externalToggle.style.display = 'none';
            }
        }
    }

    setupTabHandlers() {
        const tabBtns = document.querySelectorAll('#table-content .tab-btn');
        const tabContents = document.querySelectorAll('#table-content .controls-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;

                // Деактивируем все вкладки
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Активируем выбранную вкладку
                btn.classList.add('active');
                const activeTabContent = document.querySelector(`#table-content #tab-${tabName}`);
                if (activeTabContent) {
                    activeTabContent.classList.add('active');
                }
            });
        });
    }

    setupControlHandlers() {
        // Кнопка закрытия панели
        const closeBtn = document.querySelector('#table-content #close-panel');
        const toggleBtn = document.querySelector('#table-content #toggle-controls');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeControlsPanel());
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.closeControlsPanel());
        }

        // Поиск
        const searchButton = document.querySelector('#table-content #search-button');
        const searchValue = document.querySelector('#table-content #search-value');

        if (searchButton && this.virtualTable) {
            searchButton.addEventListener('click', async () => {
                const field = document.querySelector('#table-content #search-field').value;
                const value = searchValue.value.trim();
                const statusElement = document.querySelector('#table-content #search-status');

                if (!value) {
                    if (statusElement) {
                        statusElement.innerHTML = '<span class="text-danger">Пожалуйста, введите значение для поиска</span>';
                    }
                    return;
                }

                if (statusElement) {
                    statusElement.innerHTML = '<span class="text-info">Поиск...</span>';
                }

                const success = await this.virtualTable.navigateToValue(field, value);

                if (statusElement) {
                    if (success) {
                        statusElement.innerHTML = '<span class="text-success">Значение найдено</span>';
                    } else {
                        statusElement.innerHTML = '<span class="text-danger">Значение не найдено</span>';
                    }

                    setTimeout(() => {
                        statusElement.innerHTML = '';
                    }, 3000);
                }
            });
        }

        if (searchValue && this.virtualTable) {
            searchValue.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    searchButton.click();
                }
            });
        }

        // Навигация по ID
        const goToIdButton = document.querySelector('#table-content #go-to-id-button');
        const goToId = document.querySelector('#table-content #go-to-id');

        if (goToIdButton && this.virtualTable) {
            goToIdButton.addEventListener('click', () => {
                const targetId = parseInt(goToId.value);

                if (isNaN(targetId) || targetId < 1 || targetId > 10000) {
                    alert('Пожалуйста, введите корректный ID от 1 до 10000');
                    return;
                }

                this.virtualTable.scrollToId(targetId);
            });
        }

        if (goToId && this.virtualTable) {
            goToId.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    goToIdButton.click();
                }
            });
        }

        // Кнопки навигации
        const scrollToTop = document.querySelector('#table-content #scroll-to-top');
        const scrollToBottom = document.querySelector('#table-content #scroll-to-bottom');

        if (scrollToTop && this.virtualTable) {
            scrollToTop.addEventListener('click', () => {
                this.virtualTable.scrollToId(1);
            });
        }

        if (scrollToBottom && this.virtualTable) {
            scrollToBottom.addEventListener('click', () => {
                this.virtualTable.scrollToId(10000);
            });
        }

        // Управление столбцами
        const columnToggles = document.querySelectorAll('#table-content .column-toggle');
        const resetColumns = document.querySelector('#table-content #reset-columns');

        columnToggles.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const columnKey = checkbox.dataset.column;
                const isVisible = checkbox.checked;
                this.virtualTable.toggleColumn(columnKey, isVisible);
            });
        });

        if (resetColumns && this.virtualTable) {
            resetColumns.addEventListener('click', () => {
                this.virtualTable.resetColumns();
            });
        }
    }

    closeControlsPanel() {
        const controlsPanel = document.querySelector('#table-content #controls-panel');
        const tableWrapper = document.querySelector('#table-content #table-wrapper');
        const toggleBtn = document.querySelector('#table-content #toggle-controls');
        const externalToggle = document.querySelector('#table-content #external-toggle-controls');

        if (controlsPanel && tableWrapper) {
            controlsPanel.classList.remove('open');
            tableWrapper.classList.remove('with-panel');

            if (toggleBtn) {
                toggleBtn.style.display = 'none';
            }

            if (externalToggle) {
                externalToggle.style.display = 'block';
            }
        }
    }
}

// Загружаем скрипт таблицы перед инициализацией панели
function loadTableScript() {
    return new Promise((resolve, reject) => {
        if (typeof FixedScrollbarVirtualizedTable !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = '/static/components/telemetry_data_table/table.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Инициализация после загрузки скрипта
loadTableScript()
    .then(() => {
        window.slidePanel = new SlidePanel();
    })
    .catch(error => {
        console.error('Failed to load table script:', error);
    });