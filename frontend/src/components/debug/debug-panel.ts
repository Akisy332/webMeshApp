import { eventBus } from '../../core/event-bus.js';

export class DebugPanel {
    private container: HTMLElement;
    private toggleBtn: HTMLElement;
    private logsContainer: HTMLElement;
    private clearBtn: HTMLElement;
    private testBtn: HTMLElement;
    private isOpen: boolean;

    constructor(containerId: string) {
        this.container = document.getElementById(containerId)!;
        this.toggleBtn = document.getElementById('debug-toggle-btn')!;
        this.logsContainer = document.getElementById('debug-logs')!;
        this.clearBtn = document.getElementById('debug-clear-btn')!;
        this.testBtn = document.getElementById('debug-test-btn')!;
        this.isOpen = false;

        this.init();
    }

    private init(): void {
        console.log('DebugPanel initializing...');
        
        this.bindEvents();
        this.loadPanelState();
        this.addLog('Панель отладки инициализирована');
        
        console.log('DebugPanel initialized');
    }

    private bindEvents(): void {
        // Переключение видимости панели
        this.toggleBtn.addEventListener('click', () => {
            this.toggle();
        });

        // Очистка логов
        this.clearBtn.addEventListener('click', () => {
            this.clearLogs();
        });

        // Тестовая кнопка
        this.testBtn.addEventListener('click', () => {
            this.handleTestButton();
        });

        // Обработка ошибок с правильными типами параметров
        window.addEventListener('error', (e: ErrorEvent) => {
            this.addLog(`Ошибка: ${e.message}`);
        });

        window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
            this.addLog(`Необработанный Promise: ${e.reason}`);
        });

        // Обновление позиции при ресайзе и скролле
        window.addEventListener('resize', () => {
            this.updateToggleButtonPosition();
        });

        window.addEventListener('scroll', () => {
            this.updateToggleButtonPosition();
        });
    }

    private toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    private open(): void {
        this.isOpen = true;
        this.container.classList.remove('debug-panel-hidden');
        this.updateToggleButtonPosition();
        this.updateToggleButtonText();
        this.savePanelState();
    }

    private close(): void {
        this.isOpen = false;
        this.container.classList.add('debug-panel-hidden');
        this.updateToggleButtonPosition();
        this.updateToggleButtonText();
        this.savePanelState();
    }

    private updateToggleButtonPosition(): void {
        requestAnimationFrame(() => {
            if (this.isOpen) {
                this.toggleBtn.style.left = '310px';
                this.toggleBtn.style.top = '50%';
                this.toggleBtn.style.transform = 'translateY(-50%)';
            } else {
                this.toggleBtn.style.left = '10px';
                this.toggleBtn.style.top = '50%';
                this.toggleBtn.style.transform = 'translateY(-50%)';
            }
        });
    }

    private updateToggleButtonText(): void {
        this.toggleBtn.textContent = this.isOpen ? '◀' : '▶';
        this.toggleBtn.title = this.isOpen ? 'Скрыть панель' : 'Показать панель';
    }

    private savePanelState(): void {
        localStorage.setItem('debugPanelHidden', (!this.isOpen).toString());
    }

    private loadPanelState(): void {
        const savedState = localStorage.getItem('debugPanelHidden');
        if (savedState === 'true') {
            this.container.classList.add('debug-panel-hidden');
            this.isOpen = false;
        } else {
            this.container.classList.remove('debug-panel-hidden');
            this.isOpen = true;
        }
        this.updateToggleButtonPosition();
        this.updateToggleButtonText();
    }

    public addLog(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${timestamp}] ${message}`;
        this.logsContainer.appendChild(logEntry);
        this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }

    private clearLogs(): void {
        this.logsContainer.innerHTML = '';
        this.addLog('Логи очищены');
    }

    private handleTestButton(): void {
        this.addLog('Тестовая кнопка нажата');
        
        // Тестовые действия
        this.testEventBus();
        this.testServices();
    }

    private testEventBus(): void {
        this.addLog('Проверка EventBus...');
        
        // Проверяем доступность eventBus
        if (eventBus) {
            this.addLog('EventBus: доступен');
            
            // Тестовое событие
            eventBus.emit('debug:test', { message: 'Тест отладки' });
            this.addLog('EventBus: тестовое событие отправлено');
        } else {
            this.addLog('EventBus: недоступен');
        }
    }

    private testServices(): void {
        this.addLog('Проверка сервисов...');
        
        // Проверяем доступность основных сервисов
        const services = [
            { name: 'AuthService', instance: window.mainApp?.getAuthService?.() },
            { name: 'TableService', instance: window.mainApp?.getTableService?.() },
            { name: 'SessionService', instance: window.mainApp?.getSessionService?.() },
            { name: 'MapService', instance: window.mainApp?.getMapService?.() }
        ];

        services.forEach(service => {
            if (service.instance) {
                this.addLog(`${service.name}: доступен`);
            } else {
                this.addLog(`${service.name}: недоступен`);
            }
        });
    }

    public testConnection(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.addLog(`Тестирование соединения с: ${url}`);
            
            fetch(url, { method: 'HEAD' })
                .then(response => {
                    this.addLog(`Соединение с ${url}: OK (${response.status})`);
                    resolve();
                })
                .catch(error => {
                    this.addLog(`Соединение с ${url}: ERROR - ${error.message}`);
                    reject(error);
                });
        });
    }

    public getDebugInfo(): object {
        return {
            panelOpen: this.isOpen,
            logCount: this.logsContainer.children.length,
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            services: {
                authService: !!window.mainApp?.getAuthService?.(),
                tableService: !!window.mainApp?.getTableService?.(),
                sessionService: !!window.mainApp?.getSessionService?.(),
                mapService: !!window.mainApp?.getMapService?.()
            }
        };
    }

    public exportLogs(): void {
        const logs = Array.from(this.logsContainer.children)
            .map(element => element.textContent)
            .join('\n');
        
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addLog('Логи экспортированы');
    }

    public destroy(): void {
        // Очистка событий с правильными типами
        const errorHandler = (e: ErrorEvent) => this.addLog(`Ошибка: ${e.message}`);
        const rejectionHandler = (e: PromiseRejectionEvent) => this.addLog(`Необработанный Promise: ${e.reason}`);
        
        window.removeEventListener('error', errorHandler);
        window.removeEventListener('unhandledrejection', rejectionHandler);
        window.removeEventListener('resize', this.updateToggleButtonPosition);
        window.removeEventListener('scroll', this.updateToggleButtonPosition);
    }
}