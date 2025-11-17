import { eventBus } from './core/event-bus.js';
import { EventTypes } from './core/constants.js';
import { TableService } from './services/table-service.js';
import { SessionService } from './services/session-service.js';
import { MapService } from './services/map-service.js';
import { AuthService } from './services/auth-service.js';
import { LoginForm } from './components/auth/login-form.js';
import { RegisterForm } from './components/auth/register-form.js';
import { AuthNavbar } from './components/auth/navbar.js';
import { SessionModalWindow } from './components/session/modal-window.js';
import { DebugPanel } from './components/debug/debug-panel.js';
import { TimeRangeSlider } from './components/time-slider/time-range-slider.js';
import { SlidePanel } from './components/slide-panel/slide-panel.js';
import { SocketService } from './core/socket-service.js';

class MainApp {
  private isInitialized = false;
  private tableService?: TableService;
  private sessionService?: SessionService;
  private mapService?: MapService;
  private authService?: AuthService;
  private loginForm?: LoginForm;
  private registerForm?: RegisterForm;
  private authNavbar?: AuthNavbar;
  private sessionModalWindow?: SessionModalWindow;
  private debugPanel?: DebugPanel;
  private timeRangeSlider?: TimeRangeSlider;
  private slidePanel?: SlidePanel;
  private socketService?: SocketService;

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.isInitialized) return;

    console.log('MainApp (TypeScript) initializing...');

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
      
      this.tableService = new TableService();
      console.log('TableService initialized');
      
      this.sessionService = new SessionService();
      console.log('SessionService initialized');
      
      this.mapService = new MapService('map');
      console.log('MapService initialized');
      
      // Инициализация компонентов аутентификации
      if (this.authService) {
        this.loginForm = new LoginForm('auth-modals-container', this.authService);
        this.registerForm = new RegisterForm('auth-modals-container', this.authService);
        this.authNavbar = new AuthNavbar('navbar-container', this.authService);
        console.log('Auth components initialized');
      }

      // Инициализация модального окна сессий
      this.sessionModalWindow = new SessionModalWindow();
      console.log('SessionModalWindow initialized');

      // Инициализация панели отладки
      this.debugPanel = new DebugPanel('debug-panel-container');
      console.log('DebugPanel initialized');

      // Инициализация слайдера времени
      this.timeRangeSlider = new TimeRangeSlider();
      console.log('TimeRangeSlider initialized');

      // Инициализация выдвижной панели
      this.slidePanel = new SlidePanel();
      console.log('SlidePanel initialized');
      
    } catch (error) {
      console.error('Failed to initialize services:', error);
      this.debugPanel?.addLog(`Ошибка инициализации: ${error}`);
    }
  }
  
  public getSlidePanel(): SlidePanel | undefined {
    return this.slidePanel;
  }

  public getTimeRangeSlider(): TimeRangeSlider | undefined {
    return this.timeRangeSlider;
  }

  public getDebugPanel(): DebugPanel | undefined {
    return this.debugPanel;
  }

  private setupAuthEvents(): void {
    // Обработка событий показа форм аутентификации
    document.addEventListener('auth:show-login', () => {
      this.loginForm?.show();
    });

    document.addEventListener('auth:show-register', () => {
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

  public getTableService(): TableService | undefined {
    return this.tableService;
  }

  public getSessionService(): SessionService | undefined {
    return this.sessionService;
  }

  public getMapService(): MapService | undefined {
    return this.mapService;
  }
}

// Глобальный экземпляр приложения
const app = new MainApp();

export { app as MainApp };