import { eventBus } from '../../core/event-bus.js';
import { EventTypes } from '../../core/constants.js';

export class FixedScrollbarVirtualizedTable {
    private container: HTMLElement;
    private options: any;
    private tableElement: HTMLTableElement;
    private thead: HTMLElement;
    private tbody: HTMLElement;
    private scrollbar: HTMLElement;
    private scrollbarThumb: HTMLElement;
    private tableWrapper: HTMLElement;
    private tableContainerInner: HTMLElement;
    
    private visibleRows: Set<HTMLElement> = new Set();
    private rowCache: Map<number, HTMLElement> = new Map();
    private data: any[] = [];
    private totalCount: number = 0;
    private currentOffset: number = 0;
    private rowHeight: number;
    private buffer: number;
    private cleanupThreshold: number;
    private preloadThreshold: number;
    
    private isDragging: boolean = false;
    private startY: number = 0;
    private startScroll: number = 0;
    
    private columnDefinitions: any[] = [];
    private visibleColumns: Set<string> = new Set();
    private currentSessionId: number | null = null;
    private currentFilters: any = {};
    private sortField: string = '';
    private sortDirection: 'asc' | 'desc' = 'asc';

    public panelElement: HTMLElement | null = null;

    constructor(containerId: string, options: any = {}) {
        this.container = document.getElementById(containerId)!;
        this.options = {
            apiUrl: '/api/table/data',
            limit: 200,
            rowHeight: 40,
            buffer: 20,
            cleanupThreshold: 1000,
            preloadThreshold: 50,
            columns: [],
            ...options
        };

        this.rowHeight = this.options.rowHeight;
        this.buffer = this.options.buffer;
        this.cleanupThreshold = this.options.cleanupThreshold;
        this.preloadThreshold = this.options.preloadThreshold;
        this.columnDefinitions = this.options.columns;

        this.init();
    }

    private init(): void {
        console.log('FixedScrollbarVirtualizedTable initializing...');
        
        this.createTableStructure();
        this.setupScrollbar();
        this.setupColumnDefinitions();
        this.setupEventListeners();
        this.loadInitialData();
        
        console.log('FixedScrollbarVirtualizedTable initialized');
    }

    private createTableStructure(): void {
        this.container.innerHTML = '';
        
        this.tableWrapper = document.createElement('div');
        this.tableWrapper.className = 'table-wrapper';
        this.tableWrapper.id = 'table-wrapper';
        
        this.tableContainerInner = document.createElement('div');
        this.tableContainerInner.className = 'table-container-inner';
        
        this.tableElement = document.createElement('table');
        this.tableElement.className = 'table table-striped table-hover virtualized-table';
        
        this.thead = document.createElement('thead');
        this.tbody = document.createElement('tbody');
        this.tbody.className = 'virtualized-tbody';
        
        this.tableElement.appendChild(this.thead);
        this.tableElement.appendChild(this.tbody);
        this.tableContainerInner.appendChild(this.tableElement);
        
        this.scrollbar = document.createElement('div');
        this.scrollbar.className = 'virtual-scrollbar';
        
        this.scrollbarThumb = document.createElement('div');
        this.scrollbarThumb.className = 'scrollbar-thumb';
        
        this.scrollbar.appendChild(this.scrollbarThumb);
        this.tableWrapper.appendChild(this.tableContainerInner);
        this.tableWrapper.appendChild(this.scrollbar);
        this.container.appendChild(this.tableWrapper);
        
        this.tableContainerInner.style.overflow = 'hidden';
        this.tbody.style.position = 'relative';
    }

    private setupColumnDefinitions(): void {
        if (this.columnDefinitions.length === 0) {
            this.columnDefinitions = [
                { key: 'id', title: 'ID', visible: true, width: '80px', sortable: true },
                { key: 'module_name', title: 'Модуль', visible: true, width: '150px', sortable: true },
                { key: 'module_color', title: 'Цвет', visible: true, width: '80px', sortable: false },
                { key: 'datetime', title: 'Время', visible: true, width: '180px', sortable: true },
                { key: 'datetime_unix', title: 'Unix Time', visible: false, width: '120px', sortable: true },
                { key: 'coords_lat', title: 'Широта', visible: true, width: '120px', sortable: true },
                { key: 'coords_lon', title: 'Долгота', visible: true, width: '120px', sortable: true },
                { key: 'coords_alt', title: 'Высота', visible: true, width: '100px', sortable: true },
                { key: 'gps_ok', title: 'GPS OK', visible: true, width: '90px', sortable: true },
                { key: 'rssi', title: 'RSSI', visible: false, width: '80px', sortable: true },
                { key: 'snr', title: 'SNR', visible: false, width: '80px', sortable: true },
                { key: 'source', title: 'Источник', visible: false, width: '100px', sortable: true },
                { key: 'jumps', title: 'Прыжки', visible: false, width: '80px', sortable: true },
                { key: 'id_session', title: 'Сессия', visible: false, width: '100px', sortable: true },
                { key: 'id_module', title: 'ID Модуля', visible: false, width: '120px', sortable: true }
            ];
        }
        
        this.columnDefinitions.forEach(col => {
            if (col.visible) {
                this.visibleColumns.add(col.key);
            }
        });
        
        this.renderTableHeader();
    }

    private renderTableHeader(): void {
        this.thead.innerHTML = '';
        const headerRow = document.createElement('tr');
        
        this.columnDefinitions.forEach(column => {
            if (this.visibleColumns.has(column.key)) {
                const th = document.createElement('th');
                th.textContent = column.title;
                th.style.width = column.width;
                th.style.minWidth = column.width;
                th.style.maxWidth = column.width;
                
                if (column.sortable !== false) {
                    th.style.cursor = 'pointer';
                    th.classList.add('sortable');
                    
                    if (this.sortField === column.key) {
                        th.classList.add('sorting', this.sortDirection);
                        th.innerHTML = `${column.title} <span class="sort-indicator">${this.sortDirection === 'asc' ? '↑' : '↓'}</span>`;
                    }
                    
                    th.addEventListener('click', () => {
                        this.sortData(column.key);
                    });
                }
                
                headerRow.appendChild(th);
            }
        });
        
        this.thead.appendChild(headerRow);
    }

    private setupScrollbar(): void {
        this.scrollbarThumb.addEventListener('mousedown', this.handleScrollbarDragStart.bind(this));
        document.addEventListener('mousemove', this.handleScrollbarDrag.bind(this));
        document.addEventListener('mouseup', this.handleScrollbarDragEnd.bind(this));
    }

    private setupEventListeners(): void {
        this.tableContainerInner.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        window.addEventListener('resize', this.handleResize.bind(this));
        document.addEventListener('keydown', this.handleKeyDown.bind(this));

        eventBus.on(EventTypes.SESSION.SELECTED, (session: any) => {
            this.setSession(session.id);
        });

        eventBus.on(EventTypes.SESSION.LOAD_DATA, (sessionData: any) => {
            this.handleSessionData(sessionData);
        });

        eventBus.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data: any) => {
            this.handleNewModuleData(data);
        });
    }

    private handleWheel(event: WheelEvent): void {
        event.preventDefault();
        const delta = event.deltaY;
        const scrollAmount = delta * 0.5;
        this.scrollBy(scrollAmount);
    }

    private handleScrollbarDragStart(event: MouseEvent): void {
        this.isDragging = true;
        this.startY = event.clientY;
        this.startScroll = this.currentOffset;
        this.scrollbarThumb.classList.add('dragging');
        event.preventDefault();
    }

    private handleScrollbarDrag(event: MouseEvent): void {
        if (!this.isDragging) return;
        
        const deltaY = event.clientY - this.startY;
        const scrollbarHeight = this.scrollbar.offsetHeight;
        const thumbHeight = this.scrollbarThumb.offsetHeight;
        const maxScroll = Math.max(1, scrollbarHeight - thumbHeight);
        
        const scrollRatio = deltaY / maxScroll;
        const totalScrollableHeight = Math.max(1, this.totalCount * this.rowHeight - this.tableContainerInner.offsetHeight);
        const newScroll = this.startScroll + scrollRatio * totalScrollableHeight;
        
        this.scrollTo(newScroll);
    }

    private handleScrollbarDragEnd(): void {
        this.isDragging = false;
        this.scrollbarThumb.classList.remove('dragging');
    }

    private handleResize(): void {
        this.updateTableWidth();
        this.updateScrollbarSize();
        this.renderVisibleRows(true);
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.scrollBy(this.rowHeight);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.scrollBy(-this.rowHeight);
        } else if (event.key === 'PageDown') {
            event.preventDefault();
            this.scrollBy(this.tableContainerInner.offsetHeight * 0.8);
        } else if (event.key === 'PageUp') {
            event.preventDefault();
            this.scrollBy(-this.tableContainerInner.offsetHeight * 0.8);
        } else if (event.key === 'Home') {
            event.preventDefault();
            this.scrollTo(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            this.scrollTo(this.totalCount * this.rowHeight);
        }
    }

    private setSession(sessionId: number): void {
        this.currentSessionId = sessionId;
        this.currentOffset = 0;
        this.clearRowCache();
        this.loadInitialData();
    }

    private handleSessionData(sessionData: any): void {
        if (sessionData && sessionData.modules) {
            console.log('Session data received for table', sessionData);
        }
    }

    private handleNewModuleData(data: any): void {
        if (!data?.points || !this.currentSessionId) return;

        Object.values(data.points).forEach((moduleData: any) => {
            if (moduleData.id_session === this.currentSessionId) {
                this.updateOrAddRow(moduleData);
            }
        });
    }

    private updateOrAddRow(moduleData: any): void {
        const existingIndex = this.data.findIndex(row => 
            row.id_module === moduleData.id_module && 
            row.datetime_unix === moduleData.datetime_unix
        );

        if (existingIndex !== -1) {
            this.data[existingIndex] = { ...this.data[existingIndex], ...moduleData };
            const rowElement = this.rowCache.get(existingIndex);
            if (rowElement) {
                this.updateRowData(rowElement, existingIndex);
            }
        } else {
            this.data.unshift(moduleData);
            this.totalCount++;
            this.shiftRowCache();
            this.renderVisibleRows(false);
            this.updateScrollbarSize();
        }
    }

    private shiftRowCache(): void {
        const newCache = new Map<number, HTMLElement>();
        this.rowCache.forEach((row, index) => {
            newCache.set(index + 1, row);
        });
        this.rowCache = newCache;
        
        this.visibleRows.forEach(row => {
            const oldIndex = parseInt((row as any).dataset.index || '0');
            (row as any).dataset.index = (oldIndex + 1).toString();
        });
    }

    private async loadInitialData(): Promise<void> {
        try {
            const url = this.buildApiUrl(0);
            const response = await fetch(url);
            
            if (response.ok) {
                const result = await response.json();
                this.handleDataResponse(result);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.generateTestData();
        }
    }

    public async loadMoreData(offset: number): Promise<void> {
        if (offset >= this.data.length) {
            try {
                const url = this.buildApiUrl(offset);
                const response = await fetch(url);
                
                if (response.ok) {
                    const result = await response.json();
                    const newData = result.data || result.rows || [];
                    
                    this.data.push(...newData);
                    this.totalCount = result.totalCount || result.total || this.data.length;
                    
                    this.updateScrollbarSize();
                    this.renderVisibleRows(false);
                }
            } catch (error) {
                console.error('Error loading more data:', error);
            }
        }
    }

    private buildApiUrl(offset: number): string {
        const params = new URLSearchParams({
            limit: this.options.limit.toString(),
            offset: offset.toString()
        });

        if (this.currentSessionId) {
            params.append('session_id', this.currentSessionId.toString());
        }

        Object.entries(this.currentFilters).forEach(([key, value]) => {
            if (value) {
                params.append(key, value.toString());
            }
        });

        if (this.sortField) {
            params.append('sort', this.sortField);
            params.append('order', this.sortDirection);
        }

        return `${this.options.apiUrl}?${params.toString()}`;
    }

    private handleDataResponse(result: any): void {
        this.data = result.data || result.rows || [];
        this.totalCount = result.totalCount || result.total || this.data.length;
        
        this.updateScrollbarSize();
        this.renderVisibleRows(true);
    }

    private generateTestData(): void {
        this.data = [];
        const modules = ['Module A', 'Module B', 'Module C', 'Module D'];
        const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
        
        for (let i = 1; i <= 1000; i++) {
            const moduleIndex = i % modules.length;
            this.data.push({
                id: i,
                module_name: modules[moduleIndex],
                module_color: colors[moduleIndex],
                datetime: new Date().toISOString(),
                datetime_unix: Math.floor(Date.now() / 1000) - (1000 - i) * 10,
                coords_lat: 56.4 + (Math.random() - 0.5) * 0.1,
                coords_lon: 84.9 + (Math.random() - 0.5) * 0.1,
                coords_alt: Math.round(100 + Math.random() * 50),
                gps_ok: Math.random() > 0.1,
                rssi: -80 + Math.random() * 20,
                snr: 10 + Math.random() * 10,
                source: 'gateway_' + (i % 3),
                jumps: i % 5,
                id_session: this.currentSessionId || 1,
                id_module: `module_${moduleIndex + 1}`
            });
        }
        this.totalCount = this.data.length;
        this.updateScrollbarSize();
        this.renderVisibleRows(true);
    }

    public scrollBy(amount: number): void {
        const newOffset = this.currentOffset + amount;
        this.scrollTo(newOffset);
    }

    public scrollTo(offset: number): void {
        const maxOffset = Math.max(0, this.totalCount * this.rowHeight - this.tableContainerInner.offsetHeight);
        this.currentOffset = Math.max(0, Math.min(maxOffset, offset));
        
        this.updateScrollbarPosition();
        this.renderVisibleRows(false);
        this.preloadDataIfNeeded();
    }

    public scrollToId(id: number): boolean {
        const rowIndex = this.data.findIndex(row => row.id === id);
        if (rowIndex !== -1) {
            const targetOffset = rowIndex * this.rowHeight;
            this.scrollTo(targetOffset);
            this.highlightRow(rowIndex);
            return true;
        }
        return false;
    }

    private highlightRow(index: number): void {
        this.visibleRows.forEach(row => {
            row.classList.remove('highlighted');
        });
        
        const rowElement = this.rowCache.get(index);
        if (rowElement) {
            rowElement.classList.add('highlighted');
            
            const rowTop = index * this.rowHeight;
            const rowBottom = rowTop + this.rowHeight;
            const containerTop = this.currentOffset;
            const containerBottom = containerTop + this.tableContainerInner.offsetHeight;
            
            if (rowTop < containerTop) {
                this.scrollTo(rowTop - 10);
            } else if (rowBottom > containerBottom) {
                this.scrollTo(rowBottom - this.tableContainerInner.offsetHeight + 10);
            }
        }
    }

    public async navigateToValue(field: string, value: string): Promise<boolean> {
        try {
            const foundIndex = this.data.findIndex(row => {
                const fieldValue = row[field];
                return fieldValue && fieldValue.toString().toLowerCase().includes(value.toLowerCase());
            });
            
            if (foundIndex !== -1) {
                return this.scrollToId(this.data[foundIndex].id);
            }
            
            const response = await fetch(`${this.options.apiUrl}/search?field=${field}&value=${value}&session_id=${this.currentSessionId || ''}`);
            if (response.ok) {
                const result = await response.json();
                if (result.data && result.data.length > 0) {
                    return this.scrollToId(result.data[0].id);
                }
            }
        } catch (error) {
            console.error('Error searching:', error);
        }
        return false;
    }

    public renderVisibleRows(forceCleanup: boolean = false): void {
        const containerHeight = this.tableContainerInner.offsetHeight;
        const startIndex = Math.floor(this.currentOffset / this.rowHeight);
        const visibleCount = Math.ceil(containerHeight / this.rowHeight);
        
        const start = Math.max(0, startIndex - this.buffer);
        const end = Math.min(this.totalCount, startIndex + visibleCount + this.buffer);
        
        if (forceCleanup || this.rowCache.size > this.cleanupThreshold) {
            this.cleanupRowCache(start, end);
        }
        
        this.removeInvisibleRows(start, end);
        
        for (let i = start; i < end; i++) {
            this.renderRow(i);
        }
        
        this.updateTbodyHeight();
    }

    private renderRow(index: number): void {
        let rowElement = this.rowCache.get(index);
        
        if (!rowElement) {
            rowElement = this.createRowElement(index);
            this.rowCache.set(index, rowElement);
            this.visibleRows.add(rowElement);
        }
        
        if (!rowElement.parentElement) {
            this.tbody.appendChild(rowElement);
        }
        
        this.updateRowData(rowElement, index);
    }

    private createRowElement(index: number): HTMLElement {
        const row = document.createElement('tr');
        row.style.height = `${this.rowHeight}px`;
        row.style.position = 'absolute';
        row.style.top = `${index * this.rowHeight}px`;
        row.style.left = '0';
        row.style.right = '0';
        (row as any).dataset.index = index.toString();
        
        this.columnDefinitions.forEach(column => {
            if (this.visibleColumns.has(column.key)) {
                const cell = document.createElement('td');
                cell.style.width = column.width;
                cell.style.minWidth = column.width;
                cell.style.maxWidth = column.width;
                cell.style.whiteSpace = 'nowrap';
                cell.style.overflow = 'hidden';
                cell.style.textOverflow = 'ellipsis';
                row.appendChild(cell);
            }
        });
        
        return row;
    }

    private updateRowData(row: HTMLElement, index: number): void {
        const rowData = this.data[index];
        if (!rowData) {
            this.loadMoreData(index);
            return;
        }
        
        const cells = row.querySelectorAll('td');
        let cellIndex = 0;
        
        this.columnDefinitions.forEach(column => {
            if (this.visibleColumns.has(column.key)) {
                if (cells[cellIndex]) {
                    const cell = cells[cellIndex] as HTMLElement;
                    
                    let displayValue = rowData[column.key];
                    
                    if (column.key === 'module_color') {
                        cell.innerHTML = `<div style="width: 20px; height: 20px; background-color: ${displayValue || '#CCCCCC'}; border-radius: 3px; border: 1px solid #666;" title="${displayValue || ''}"></div>`;
                    } else if (column.key === 'gps_ok') {
                        displayValue = displayValue ? '✅' : '❌';
                        cell.textContent = displayValue;
                        cell.title = displayValue ? 'GPS OK' : 'GPS Error';
                    } else if (column.key === 'datetime' && displayValue) {
                        const date = new Date(displayValue);
                        displayValue = date.toLocaleString('ru-RU');
                        cell.textContent = displayValue;
                    } else if (column.key === 'coords_lat' || column.key === 'coords_lon') {
                        displayValue = displayValue ? Number(displayValue).toFixed(6) : 'N/A';
                        cell.textContent = displayValue;
                    } else if (column.key === 'coords_alt') {
                        displayValue = displayValue ? `${Math.round(displayValue)} м` : 'N/A';
                        cell.textContent = displayValue;
                    } else {
                        cell.textContent = displayValue || 'N/A';
                    }
                    
                    cell.title = displayValue || '';
                }
                cellIndex++;
            }
        });
        
        row.style.top = `${index * this.rowHeight}px`;
    }

    private removeInvisibleRows(start: number, end: number): void {
        this.visibleRows.forEach(row => {
            const rowIndex = parseInt((row as any).dataset.index || '-1');
            if (rowIndex < start || rowIndex >= end) {
                row.remove();
                this.visibleRows.delete(row);
            }
        });
    }

    private cleanupRowCache(currentStart: number, currentEnd: number): void {
        const cleanupBuffer = this.buffer * 3;
        const keepStart = Math.max(0, currentStart - cleanupBuffer);
        const keepEnd = Math.min(this.totalCount, currentEnd + cleanupBuffer);
        
        this.rowCache.forEach((row, index) => {
            if (index < keepStart || index >= keepEnd) {
                if (this.visibleRows.has(row)) {
                    row.remove();
                    this.visibleRows.delete(row);
                }
                this.rowCache.delete(index);
            }
        });
    }

    private updateTbodyHeight(): void {
        this.tbody.style.height = `${this.totalCount * this.rowHeight}px`;
    }

    public updateScrollbarSize(): void {
        const containerHeight = this.tableContainerInner.offsetHeight;
        const totalHeight = this.totalCount * this.rowHeight;
        
        if (totalHeight > containerHeight) {
            const thumbHeight = Math.max(20, (containerHeight / totalHeight) * containerHeight);
            this.scrollbarThumb.style.height = `${thumbHeight}px`;
            this.scrollbar.style.display = 'block';
        } else {
            this.scrollbar.style.display = 'none';
        }
    }

    private updateScrollbarPosition(): void {
        const containerHeight = this.tableContainerInner.offsetHeight;
        const totalHeight = this.totalCount * this.rowHeight;
        const thumbHeight = this.scrollbarThumb.offsetHeight;
        const maxScroll = containerHeight - thumbHeight;
        
        if (maxScroll > 0) {
            const scrollRatio = this.currentOffset / (totalHeight - containerHeight);
            const thumbPosition = scrollRatio * maxScroll;
            this.scrollbarThumb.style.transform = `translateY(${thumbPosition}px)`;
        } else {
            this.scrollbarThumb.style.transform = 'translateY(0px)';
        }
    }

    private preloadDataIfNeeded(): void {
        const currentEnd = Math.floor((this.currentOffset + this.tableContainerInner.offsetHeight) / this.rowHeight);
        
        if (this.totalCount - currentEnd < this.preloadThreshold) {
            const nextOffset = Math.floor(this.data.length / this.options.limit) * this.options.limit;
            if (nextOffset < this.totalCount) {
                this.loadMoreData(nextOffset);
            }
        }
    }

    public updateTableWidth(): void {
        if (this.panelElement) {
            const panelWidth = this.panelElement.offsetWidth;
            this.container.style.width = `${panelWidth}px`;
            this.tableWrapper.style.width = `${panelWidth}px`;
        }
    }

    public updatePanelWidth(): void {
        this.updateTableWidth();
    }

    public toggleColumn(columnKey: string, isVisible: boolean): void {
        if (isVisible) {
            this.visibleColumns.add(columnKey);
        } else {
            this.visibleColumns.delete(columnKey);
        }
        
        this.renderTableHeader();
        this.clearRowCache();
        this.renderVisibleRows(true);
    }

    public resetColumns(): void {
        this.visibleColumns.clear();
        this.columnDefinitions.forEach(col => {
            if (col.visible) {
                this.visibleColumns.add(col.key);
            }
        });
        
        this.renderTableHeader();
        this.clearRowCache();
        this.renderVisibleRows(true);
    }

    private clearRowCache(): void {
        this.visibleRows.forEach(row => row.remove());
        this.visibleRows.clear();
        this.rowCache.clear();
    }

    private sortData(field: string): void {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }
        
        this.data.sort((a, b) => {
            const aVal = a[field];
            const bVal = b[field];
            
            let result = 0;
            if (aVal < bVal) result = -1;
            if (aVal > bVal) result = 1;
            
            return this.sortDirection === 'desc' ? -result : result;
        });
        
        this.renderTableHeader();
        this.clearRowCache();
        this.renderVisibleRows(true);
    }

    public setFilter(field: string, value: any): void {
        this.currentFilters[field] = value;
        this.currentOffset = 0;
        this.clearRowCache();
        this.loadInitialData();
    }

    public clearFilters(): void {
        this.currentFilters = {};
        this.currentOffset = 0;
        this.clearRowCache();
        this.loadInitialData();
    }

    public getColumnState(): { [key: string]: boolean } {
        const state: { [key: string]: boolean } = {};
        this.columnDefinitions.forEach(col => {
            state[col.key] = this.visibleColumns.has(col.key);
        });
        return state;
    }

    public setData(newData: any[], totalCount?: number): void {
        this.data = newData;
        this.totalCount = totalCount || newData.length;
        this.currentOffset = 0;
        
        this.clearRowCache();
        this.updateScrollbarSize();
        this.renderVisibleRows(true);
    }

    public getVisibleRange(): { start: number; end: number } {
        const startIndex = Math.floor(this.currentOffset / this.rowHeight);
        const visibleCount = Math.ceil(this.tableContainerInner.offsetHeight / this.rowHeight);
        return {
            start: startIndex,
            end: startIndex + visibleCount
        };
    }

    public exportToCSV(): void {
        const headers = this.columnDefinitions
            .filter(col => this.visibleColumns.has(col.key))
            .map(col => col.title);
        
        const csvData = [
            headers.join(','),
            ...this.data.map(row => 
                this.columnDefinitions
                    .filter(col => this.visibleColumns.has(col.key))
                    .map(col => {
                        let value = row[col.key] || '';
                        if (col.key === 'gps_ok') {
                            value = value ? 'OK' : 'ERROR';
                        }
                        return `"${value.toString().replace(/"/g, '""')}"`;
                    })
                    .join(',')
            )
        ].join('\n');
        
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `telemetry_data_${this.currentSessionId || 'all'}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    public getStats(): any {
        const modules = new Set(this.data.map(row => row.module_name).filter(Boolean));
        const sessions = new Set(this.data.map(row => row.id_session).filter(Boolean));
        const gpsOkCount = this.data.filter(row => row.gps_ok).length;
        
        return {
            totalRecords: this.totalCount,
            uniqueModules: modules.size,
            uniqueSessions: sessions.size,
            gpsAccuracy: this.totalCount > 0 ? Math.round((gpsOkCount / this.totalCount) * 100) : 0,
            dateRange: {
                min: this.data.length > 0 ? Math.min(...this.data.map(row => row.datetime_unix).filter(Boolean)) : 0,
                max: this.data.length > 0 ? Math.max(...this.data.map(row => row.datetime_unix).filter(Boolean)) : 0
            }
        };
    }

    public destroy(): void {
        this.scrollbarThumb.removeEventListener('mousedown', this.handleScrollbarDragStart);
        document.removeEventListener('mousemove', this.handleScrollbarDrag);
        document.removeEventListener('mouseup', this.handleScrollbarDragEnd);
        this.tableContainerInner.removeEventListener('wheel', this.handleWheel);
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('keydown', this.handleKeyDown);
        
        // eventBus.off(EventTypes.SESSION.SELECTED);
        // eventBus.off(EventTypes.SESSION.LOAD_DATA);
        // eventBus.off(EventTypes.SOCKET.NEW_DATA_MODULE);
        
        this.clearRowCache();
        this.container.innerHTML = '';
    }
}