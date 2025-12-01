import { eventBus } from './core/event-bus.js';
import { EventTypes } from './core/constants.js';
import { settingsManager, SettingsSchema } from './core/settings-manager.js';
import { SessionDataTableComponent } from './components/session-data-table/session-data-table-component.js';
import { SessionService } from './services/session-service.js';
import { MapService } from './features/map/index.js';
import { AuthService } from './services/auth-service.js';
import { LoginForm } from './components/auth/login-form.js';
import { RegisterForm } from './components/auth/register-form.js';
import { Navbar } from './components/ui/navbar/navbar.js';
import { SessionModalWindow } from './components/session/modal-window.js';
import { SocketService } from './core/socket-service.js';

class MainApp {
    private isInitialized = false;

    private settingsManager = settingsManager;
    private sessionDataTable?: SessionDataTableComponent;
    private sessionService?: SessionService;
    private mapService?: MapService;
    private authService?: AuthService;
    private loginForm?: LoginForm;
    private registerForm?: RegisterForm;
    private navbar?: Navbar;
    private sessionModalWindow?: SessionModalWindow;
    private socketService?: SocketService;

    constructor() {
        this.init();
    }

    private init(): void {
        if (this.isInitialized) return;

        console.log('MainApp (TypeScript) initializing...');

        console.log('📁 SettingsManager loaded from storage');

        this.setupErrorHandling();
        this.setupGlobalEvents();

        this.isInitialized = true;
    }

    private setupErrorHandling(): void {
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            this.showNotification('Application error occurred', 'error');
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.showNotification('Async operation error', 'error');
        });
    }

    private setupGlobalEvents(): void {
        eventBus.on(EventTypes.ERROR, (error: string) => {
            this.showNotification(`Error: ${error}`, 'error');
        });

        document.addEventListener('DOMContentLoaded', () => {
            this.onDomReady();
        });
    }

    private onDomReady(): void {
        console.log('DOM ready - initializing services');

        if (!window.showNotification) {
            window.showNotification = this.showNotification.bind(this);
        }

        this.initializeAsync();
    }

    private async initializeAsync(): Promise<void> {
        await this.waitForDom();
        this.initializeServices();
        this.setupAuthEvents();
    }

    private waitForDom(): Promise<void> {
        return new Promise((resolve) => {
            const checkDom = () => {
                const authContainer = document.getElementById('auth-modals-container');
                if (authContainer) {
                    resolve();
                } else {
                    setTimeout(checkDom, 50);
                }
            };
            checkDom();
        });
    }

    private initializeServices(): void {
        try {
            console.log('Starting TypeScript services initialization...');

            // Инициализация сервисов
            this.authService = new AuthService();
            console.log('AuthService initialized');

            this.socketService = new SocketService();
            console.log('SocketService initialized');

            this.sessionDataTable = new SessionDataTableComponent('table-container', this.settingsManager);

            this.sessionService = new SessionService();
            console.log('SessionService initialized');

            this.mapService = new MapService(
                {
                    containerId: 'map',
                    center: [56.452, 84.9615],
                    zoom: 13,
                    minZoom: 3,
                    maxZoom: 18,
                },
                this.settingsManager
            );

            // Инициализация компонентов аутентификации
            if (this.authService) {
                this.loginForm = new LoginForm('auth-modals-container', this.authService);
                this.registerForm = new RegisterForm('auth-modals-container', this.authService);
                console.log('Auth components initialized');
            }

            // Инициализация navbar
            this.navbar = new Navbar('navbar-container');

            // Инициализация модального окна сессий
            this.sessionModalWindow = new SessionModalWindow();
            console.log('SessionModalWindow initialized');
        } catch (error) {
            console.error('Failed to initialize services:', error);
        }
    }

    private setupAuthEvents(): void {
        // Обработка событий показа форм аутентификации
        // Обработка событий от Navbar
        document.addEventListener('auth:show-login', () => {
            console.log('MainApp: Received auth:show-login event');
            this.loginForm?.show();
        });

        document.addEventListener('auth:show-register', () => {
            console.log('MainApp: Received auth:show-register event');
            this.registerForm?.show();
        });

        // Обработка событий аутентификации для обновления UI
        document.addEventListener('auth:login', () => {
            this.updateAuthUI();
        });

        document.addEventListener('auth:logout', () => {
            this.updateAuthUI();
        });
    }

    private updateAuthUI(): void {
        // Обновление UI в зависимости от состояния аутентификации
        // Эта логика теперь в AuthService, но можно добавить дополнительные действия
        console.log('Auth UI updated');
    }

    private showNotification(message: string, type: string = 'info'): void {
        const notification = document.createElement('div');
        const alertClass = type === 'error' ? 'danger' : type;

        notification.className = `alert alert-${alertClass} position-fixed`;
        notification.style.cssText = `
      top: 20px;
      right: 20px;
      z-index: 9999;
      min-width: 300px;
      animation: slideInRight 0.3s ease-out;
    `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 5000);
    }

    // Публичные методы для доступа к сервисам
    public getAuthService(): AuthService | undefined {
        return this.authService;
    }

    public getSessionService(): SessionService | undefined {
        return this.sessionService;
    }

    public getMapService(): MapService | undefined {
        return this.mapService;
    }

    // ПРОКСИ-МЕТОДЫ ДЛЯ УДОБСТВА (ОПЦИОНАЛЬНО)
    public getAllCheckboxStates(sessionId: number): Record<string, { marker: boolean; trace: boolean }> {
        return this.settingsManager.getAllCheckboxStates(sessionId);
    }

    public setCheckboxState(sessionId: number, moduleId: string, type: 'marker' | 'trace', checked: boolean): void {
        this.settingsManager.setCheckboxState(sessionId, moduleId, type, checked);
    }

    public getCheckboxState(sessionId: number, moduleId: string): { marker: boolean; trace: boolean } {
        return this.settingsManager.getCheckboxState(sessionId, moduleId);
    }

    public setSortSettings(field: string, direction: 'asc' | 'desc'): void {
        this.settingsManager.setSortSettings(field, direction);
    }

    public getSortSettings(): { field: string; direction: 'asc' | 'desc' } {
        return this.settingsManager.getSortSettings();
    }

    // МЕТОДЫ ДЛЯ КАРТЫ
    public setMapSettings(zoom: number, center: { lat: number; lon: number }, baseLayer: string): void {
        this.settingsManager.setMapSettings(zoom, center, baseLayer);
    }

    public getMapSettings(): {
        zoom: number;
        center: { lat: number; lon: number };
        baseLayer: string;
    } {
        return this.settingsManager.getMapSettings();
    }

    public setMapBaseLayer(layer: string): void {
        this.settingsManager.setMapBaseLayer(layer);
    }

    public getMapBaseLayer(): string {
        return this.settingsManager.getMapBaseLayer();
    }

    // УНИВЕРСАЛЬНЫЕ МЕТОДЫ ДЛЯ ЛЮБЫХ НАСТРОЕК
    public setSetting<T extends keyof SettingsSchema>(
        category: T,
        key: keyof SettingsSchema[T],
        value: SettingsSchema[T][keyof SettingsSchema[T]]
    ): void {
        this.settingsManager.set(category, key, value);
    }

    public getSetting<T extends keyof SettingsSchema>(
        category: T,
        key: keyof SettingsSchema[T],
        defaultValue?: SettingsSchema[T][keyof SettingsSchema[T]]
    ): SettingsSchema[T][keyof SettingsSchema[T]] | undefined {
        return this.settingsManager.get(category, key, defaultValue);
    }
}

// Глобальный экземпляр приложения
const app = new MainApp();

(window as any).mainApp = app;

export { app as MainApp };
