import { FixedScrollbarVirtualizedTable } from '../telemetry-data-table/table.js';

export class SlidePanel {
    private panel: HTMLElement;
    private toggleBtn: HTMLElement;
    private isOpen: boolean = false;
    private isTableLoading: boolean = false;
    private isTableLoaded: boolean = false;
    private virtualTable: FixedScrollbarVirtualizedTable | null = null;
    private tableContent: HTMLElement;

    constructor() {
        this.panel = document.getElementById('slidePanel')!;
        this.toggleBtn = document.getElementById('togglePanel')!;
        this.tableContent = document.getElementById('table-content')!;

        this.init();
    }

    private init(): void {
        console.log('SlidePanel initializing...');

        this.bindEvents();

        console.log('SlidePanel initialized');
    }

    private bindEvents(): void {
        this.toggleBtn.addEventListener('click', () => {
            this.toggle();
        });

        // Закрытие по ESC
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
        });
    }

    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    public open(): void {
        this.isOpen = true;
        this.panel.classList.add('open');
        document.body.style.overflow = 'hidden';

        if (!this.isTableLoading) {
            if (!this.isTableLoaded) {
                this.loadTable();
            } else if (this.virtualTable) {
                // Если таблица уже загружена, обновляем ширину
                setTimeout(() => {
                    this.virtualTable.updatePanelWidth();
                }, 50);
            }
        }
    }

    public close(): void {
        this.isOpen = false;
        this.panel.classList.remove('open');
        document.body.style.overflow = '';
    }

    private async loadTable(): Promise<void> {
        this.isTableLoading = true;
        console.log('Loading table...');

        if (!this.isTableLoaded) {
            this.tableContent.innerHTML = `
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
                this.tableContent.innerHTML = html;
                this.isTableLoaded = true;
                this.isTableLoading = false;

                // Инициализируем таблицу после загрузки DOM
                setTimeout(() => {
                    this.initializeTableAndControls();
                }, 100);
            } else {
                throw new Error('Failed to load table: ' + response.status);
            }
        } catch (error) {
            console.error('Error loading table:', error);
            this.tableContent.innerHTML = `
                <div class="alert alert-danger">
                    <h5>Ошибка загрузки таблицы</h5>
                    <p>${(error as Error).message}</p>
                    <button class="btn btn-primary" onclick="window.mainApp.getSlidePanel()?.loadTable()">Попробовать снова</button>
                </div>
            `;
        }
    }

    private initializeTableAndControls(): void {
        const tableContainer = document.querySelector('#table-content #table-container') as HTMLElement;
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

        // Создаем новый экземпляр таблицы через импорт
        try {
            this.virtualTable = new FixedScrollbarVirtualizedTable('table-container', {
                apiUrl: '/api/table/users',
                limit: 200,
                rowHeight: 45,
                buffer: 50,
                cleanupThreshold: 500,
                preloadThreshold: 100,
            });

            // Сохраняем ссылку на элемент панели
            (this.virtualTable as any).panelElement = this.panel;

            // Принудительно обновляем размеры
            setTimeout(() => {
                if (this.virtualTable) {
                    this.virtualTable.updateTableWidth();
                    this.virtualTable.updateScrollbarSize();
                    this.virtualTable.renderVisibleRows(true);
                    this.virtualTable.updatePanelWidth();
                }
            }, 200);

            this.initializeTableControls();
        } catch (error) {
            console.error('Error creating virtual table:', error);
        }
    }

    private initializeTableControls(): void {
        // Убедимся, что элементы управления существуют
        const controlsPanel = document.querySelector('#table-content #controls-panel') as HTMLElement;
        const tableWrapper = document.querySelector('#table-content #table-wrapper') as HTMLElement;

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

    private createExternalToggleButton(): void {
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
        const headerControls = document.querySelector('#table-content .header-controls') as HTMLElement;
        if (headerControls) {
            headerControls.appendChild(externalToggle);

            // Обработчик для кнопки
            externalToggle.addEventListener('click', () => this.openControlsPanel());
        }
    }

    private openControlsPanel(): void {
        const controlsPanel = document.querySelector('#table-content #controls-panel') as HTMLElement;
        const tableWrapper = document.querySelector('#table-content #table-wrapper') as HTMLElement;
        const toggleBtn = document.querySelector('#table-content #toggle-controls') as HTMLElement;
        const externalToggle = document.querySelector('#table-content #external-toggle-controls') as HTMLElement;

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

    private setupTabHandlers(): void {
        const tabBtns = document.querySelectorAll('#table-content .tab-btn');
        const tabContents = document.querySelectorAll('#table-content .controls-content');

        tabBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const tabName = (btn as HTMLElement).dataset.tab;
                if (!tabName) return;

                // Деактивируем все вкладки
                tabBtns.forEach((b) => b.classList.remove('active'));
                tabContents.forEach((content) => content.classList.remove('active'));

                // Активируем выбранную вкладку
                btn.classList.add('active');
                const activeTabContent = document.querySelector(`#table-content #tab-${tabName}`) as HTMLElement;
                if (activeTabContent) {
                    activeTabContent.classList.add('active');
                }
            });
        });
    }

    private setupControlHandlers(): void {
        // Кнопка закрытия панели
        const closeBtn = document.querySelector('#table-content #close-panel') as HTMLElement;
        const toggleBtn = document.querySelector('#table-content #toggle-controls') as HTMLElement;

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeControlsPanel());
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.closeControlsPanel());
        }

        // Поиск
        const searchButton = document.querySelector('#table-content #search-button') as HTMLButtonElement;
        const searchValue = document.querySelector('#table-content #search-value') as HTMLInputElement;

        if (searchButton && this.virtualTable) {
            searchButton.addEventListener('click', async () => {
                const fieldSelect = document.querySelector('#table-content #search-field') as HTMLSelectElement;
                const field = fieldSelect?.value || '';
                const value = searchValue.value.trim();
                const statusElement = document.querySelector('#table-content #search-status') as HTMLElement;

                if (!value) {
                    if (statusElement) {
                        statusElement.innerHTML =
                            '<span class="text-danger">Пожалуйста, введите значение для поиска</span>';
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
            searchValue.addEventListener('keypress', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    searchButton?.click();
                }
            });
        }

        // Навигация по ID
        const goToIdButton = document.querySelector('#table-content #go-to-id-button') as HTMLButtonElement;
        const goToId = document.querySelector('#table-content #go-to-id') as HTMLInputElement;

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
            goToId.addEventListener('keypress', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    goToIdButton.click();
                }
            });
        }

        // Кнопки навигации
        const scrollToTop = document.querySelector('#table-content #scroll-to-top') as HTMLElement;
        const scrollToBottom = document.querySelector('#table-content #scroll-to-bottom') as HTMLElement;

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
        const resetColumns = document.querySelector('#table-content #reset-columns') as HTMLElement;

        columnToggles.forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                const columnKey = (checkbox as HTMLElement).dataset.column;
                const isVisible = (checkbox as HTMLInputElement).checked;
                if (columnKey) {
                    this.virtualTable.toggleColumn(columnKey, isVisible);
                }
            });
        });

        if (resetColumns && this.virtualTable) {
            resetColumns.addEventListener('click', () => {
                this.virtualTable.resetColumns();
            });
        }
    }

    private closeControlsPanel(): void {
        const controlsPanel = document.querySelector('#table-content #controls-panel') as HTMLElement;
        const tableWrapper = document.querySelector('#table-content #table-wrapper') as HTMLElement;
        const toggleBtn = document.querySelector('#table-content #toggle-controls') as HTMLElement;
        const externalToggle = document.querySelector('#table-content #external-toggle-controls') as HTMLElement;

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

    public getIsOpen(): boolean {
        return this.isOpen;
    }

    public getIsTableLoaded(): boolean {
        return this.isTableLoaded;
    }

    public destroy(): void {
        // Очистка событий
        this.toggleBtn.removeEventListener('click', this.toggle);
        document.removeEventListener('keydown', this.handleEscapeKey);

        // Уничтожаем виртуальную таблицу если она существует
        if (this.virtualTable) {
            this.virtualTable.destroy();
        }
    }

    private handleEscapeKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') this.close();
    };
}
