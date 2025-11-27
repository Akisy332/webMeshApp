import { AuthService } from '../../services/auth-service.js';

export class LoginForm {
    private container: HTMLElement;
    private isVisible: boolean;
    private authService: AuthService;

    constructor(containerId: string, authService: AuthService) {
        this.container = document.getElementById(containerId)!;
        this.isVisible = false;
        this.authService = authService;

        this.init();
    }

    private init(): void {
        this.render();
        this.bindEvents();
    }

    private render(): void {
        const loginHTML = `
        <div class="auth-overlay login-overlay" style="display: none;">
            <div class="auth-modal">
                <div class="auth-header">
                    <h3>Вход в систему</h3>
                    <button class="close-btn">&times;</button>
                </div>
                
                <form id="login-form" class="auth-form">
                    <div class="form-group">
                        <label for="login-username">Имя пользователя</label>
                        <input 
                            type="text" 
                            id="login-username" 
                            name="username" 
                            required
                            autocomplete="username"
                        >
                    </div>
                    
                    <div class="form-group">
                        <label for="login-password">Пароль</label>
                        <input 
                            type="password" 
                            id="login-password" 
                            name="password" 
                            required
                            autocomplete="current-password"
                        >
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">
                            <span class="btn-text">Войти</span>
                            <span class="btn-loading" style="display: none;">Вход...</span>
                        </button>
                    </div>
                </form>
                
                <div class="auth-footer">
                    <p>Нет аккаунта? <a href="#" class="switch-to-register">Зарегистрироваться</a></p>
                </div>
                
                <div id="login-error" class="error-message" style="display: none;"></div>
            </div>
        </div>
    `;

        this.container.insertAdjacentHTML('beforeend', loginHTML);
    }

    private bindEvents(): void {
        const closeBtn = this.container.querySelector('.close-btn');
        const form = this.container.querySelector('#login-form');
        const switchLink = this.container.querySelector('.switch-to-register');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        if (switchLink) {
            switchLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.hide();
                document.dispatchEvent(new CustomEvent('auth:show-register'));
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    private async handleLogin(): Promise<void> {
        const form = this.container.querySelector('#login-form') as HTMLFormElement;
        const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
        const btnText = submitBtn.querySelector('.btn-text') as HTMLElement;
        const btnLoading = submitBtn.querySelector('.btn-loading') as HTMLElement;
        const errorDiv = this.container.querySelector('#login-error') as HTMLElement;

        const username = (form.querySelector('#login-username') as HTMLInputElement).value;
        const password = (form.querySelector('#login-password') as HTMLInputElement).value;

        if (!username || !password) {
            this.showError('Заполните все поля');
            return;
        }

        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        try {
            const result = await this.authService.login(username, password);

            if (result.success) {
                this.hide();
                this.showSuccess(`Добро пожаловать, ${result.user!.username}!`);

                // ПЕРЕЗАГРУЗКА СТРАНИЦЫ после успешного входа
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                this.showError(result.error || 'Ошибка входа');
            }
        } catch (error) {
            this.showError('Ошибка сети. Проверьте подключение.');
        } finally {
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            submitBtn.disabled = false;
        }
    }

    public show(): void {
        const overlay = this.container.querySelector('.login-overlay') as HTMLElement;
        if (overlay) {
            overlay.style.display = 'flex';
            this.isVisible = true;

            setTimeout(() => {
                const usernameInput = this.container.querySelector('#login-username') as HTMLInputElement;
                if (usernameInput) usernameInput.focus();
            }, 100);
        }
    }

    public hide(): void {
        const overlay = this.container.querySelector('.login-overlay') as HTMLElement;
        if (overlay) {
            overlay.style.display = 'none';
            this.isVisible = false;
        }
    }

    private showError(message: string): void {
        const errorDiv = this.container.querySelector('#login-error') as HTMLElement;
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';

        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    private showSuccess(message: string): void {
        if (window.showNotification) {
            window.showNotification(message, 'success');
        } else {
            alert(message);
        }
    }
}
