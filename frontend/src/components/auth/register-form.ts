import { AuthService } from '../../services/auth-service.js';

export class RegisterForm {
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
        const registerHTML = `
        <div class="auth-overlay register-overlay" style="display: none;">
            <div class="auth-modal">
                <div class="auth-header">
                    <h3>Регистрация</h3>
                    <button class="close-btn-register">&times;</button>
                </div>
                
                <form id="register-form" class="auth-form">
                    <div class="form-group">
                        <label for="register-email">Email</label>
                        <input 
                            type="email" 
                            id="register-email" 
                            name="email" 
                            required
                            autocomplete="email"
                        >
                    </div>
                    
                    <div class="form-group">
                        <label for="register-username">Имя пользователя</label>
                        <input 
                            type="text" 
                            id="register-username" 
                            name="username" 
                            required
                            autocomplete="username"
                            minlength="3"
                        >
                        <small>Минимум 3 символа, только буквы, цифры и подчеркивания</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="register-password">Пароль</label>
                        <input 
                            type="password" 
                            id="register-password" 
                            name="password" 
                            required
                            autocomplete="new-password"
                            minlength="8"
                        >
                        <small>Минимум 8 символов, должна быть цифра и заглавная буква</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="register-password-confirm">Подтверждение пароля</label>
                        <input 
                            type="password" 
                            id="register-password-confirm" 
                            name="password_confirm" 
                            required
                            autocomplete="new-password"
                        >
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">
                            <span class="btn-text">Зарегистрироваться</span>
                            <span class="btn-loading" style="display: none;">Регистрация...</span>
                        </button>
                    </div>
                </form>
                
                <div class="auth-footer">
                    <p>Уже есть аккаунт? <a href="#" class="switch-to-login">Войти</a></p>
                </div>
                
                <div id="register-error" class="error-message" style="display: none;"></div>
                <div id="register-success" class="success-message" style="display: none;"></div>
            </div>
        </div>
    `;

        this.container.insertAdjacentHTML('beforeend', registerHTML);
    }

    private bindEvents(): void {
        const closeBtn = this.container.querySelector('.close-btn-register');
        const form = this.container.querySelector('#register-form');
        const switchLink = this.container.querySelector('.switch-to-login');
        const passwordInput = this.container.querySelector('#register-password') as HTMLInputElement;
        const confirmInput = this.container.querySelector('#register-password-confirm') as HTMLInputElement;

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        if (switchLink) {
            switchLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.hide();
                document.dispatchEvent(new CustomEvent('auth:show-login'));
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('input', () => {
                this.validatePassword();
            });
        }

        if (confirmInput) {
            confirmInput.addEventListener('input', () => {
                this.validatePasswordMatch();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    private validatePassword(): boolean {
        const password = (this.container.querySelector('#register-password') as HTMLInputElement).value;
        const requirements = {
            length: password.length >= 8,
            digit: /\d/.test(password),
            uppercase: /[A-Z]/.test(password)
        };

        return requirements.length && requirements.digit && requirements.uppercase;
    }

    private validatePasswordMatch(): boolean {
        const password = (this.container.querySelector('#register-password') as HTMLInputElement).value;
        const confirm = (this.container.querySelector('#register-password-confirm') as HTMLInputElement).value;

        return password === confirm;
    }

    private async handleRegister(): Promise<void> {
        const form = this.container.querySelector('#register-form') as HTMLFormElement;
        const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
        const btnText = submitBtn.querySelector('.btn-text') as HTMLElement;
        const btnLoading = submitBtn.querySelector('.btn-loading') as HTMLElement;
        const errorDiv = this.container.querySelector('#register-error') as HTMLElement;

        const email = (form.querySelector('#register-email') as HTMLInputElement).value;
        const username = (form.querySelector('#register-username') as HTMLInputElement).value;
        const password = (form.querySelector('#register-password') as HTMLInputElement).value;
        const passwordConfirm = (form.querySelector('#register-password-confirm') as HTMLInputElement).value;

        if (!email || !username || !password || !passwordConfirm) {
            this.showError('Заполните все поля');
            return;
        }

        if (!this.validatePassword()) {
            this.showError('Пароль должен содержать минимум 8 символов, цифру и заглавную букву');
            return;
        }

        if (!this.validatePasswordMatch()) {
            this.showError('Пароли не совпадают');
            return;
        }

        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        try {
            const result = await this.authService.register(email, username, password);

            if (result.success) {
                this.showSuccess('Регистрация успешна! Теперь вы можете войти.');
                setTimeout(() => {
                    this.hide();
                    document.dispatchEvent(new CustomEvent('auth:show-login'));
                }, 2000);
            } else {
                this.showError(result.error || 'Ошибка регистрации');
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
        const overlay = this.container.querySelector('.register-overlay') as HTMLElement;
        if (overlay) {
            overlay.style.display = 'flex';
            this.isVisible = true;

            setTimeout(() => {
                const emailInput = this.container.querySelector('#register-email') as HTMLInputElement;
                if (emailInput) emailInput.focus();
            }, 100);
        }
    }

    public hide(): void {
        const overlay = this.container.querySelector('.register-overlay') as HTMLElement;
        if (overlay) {
            overlay.style.display = 'none';
            this.isVisible = false;
        }

        const form = this.container.querySelector('#register-form') as HTMLFormElement;
        const errorDiv = this.container.querySelector('#register-error') as HTMLElement;
        const successDiv = this.container.querySelector('#register-success') as HTMLElement;

        if (form) form.reset();
        if (errorDiv) errorDiv.style.display = 'none';
        if (successDiv) successDiv.style.display = 'none';
    }

    private showSuccess(message: string): void {
        const successDiv = this.container.querySelector('#register-success') as HTMLElement;
        successDiv.textContent = message;
        successDiv.style.display = 'block';

        const errorDiv = this.container.querySelector('#register-error') as HTMLElement;
        errorDiv.style.display = 'none';
    }

    private showError(message: string): void {
        const errorDiv = this.container.querySelector('#register-error') as HTMLElement;
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}