/**
 * Register Form Component
 */
class RegisterForm {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.isVisible = false;

        this.init();
    }

    init() {
        this.render();
        this.bindEvents();
    }

    render() {
        const registerHTML = `
        <div class="auth-overlay register-overlay" style="display: none;">
            <div class="auth-modal">
                <div class="auth-header">
                    <h3>Регистрация</h3>
                    <button class="close-btn">&times;</button>
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

    bindEvents() {
        // Проверяем все элементы перед добавлением обработчиков
        const closeBtn = this.container.querySelector('.close-btn');
        const overlay = this.container.querySelector('.register-overlay');
        const form = this.container.querySelector('#register-form');
        const switchLink = this.container.querySelector('.switch-to-login');
        const passwordInput = this.container.querySelector('#register-password');
        const confirmInput = this.container.querySelector('#register-password-confirm');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }

        // if (overlay) {
        //     overlay.addEventListener('click', (e) => {
        //         if (e.target === e.currentTarget) {
        //             this.hide();
        //         }
        //     });
        // }

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

    validatePassword() {
        const password = this.container.querySelector('#register-password').value;
        const requirements = {
            length: password.length >= 8,
            digit: /\d/.test(password),
            uppercase: /[A-Z]/.test(password)
        };

        // Можно добавить визуализацию требований к паролю
        return requirements.length && requirements.digit && requirements.uppercase;
    }

    validatePasswordMatch() {
        const password = this.container.querySelector('#register-password').value;
        const confirm = this.container.querySelector('#register-password-confirm').value;

        return password === confirm;
    }

    async handleRegister() {
        const form = this.container.querySelector('#register-form');
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');
        const errorDiv = this.container.querySelector('#register-error');

        const email = form.querySelector('#register-email').value;
        const username = form.querySelector('#register-username').value;
        const password = form.querySelector('#register-password').value;
        const passwordConfirm = form.querySelector('#register-password-confirm').value;

        // Валидация
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

        // Показываем индикатор загрузки
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        try {
            const result = await authManager.register(email, username, password);

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
            // Восстанавливаем кнопку
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            submitBtn.disabled = false;
        }
    }

    show() {
        const overlay = this.container.querySelector('.register-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            this.isVisible = true;

            setTimeout(() => {
                const emailInput = this.container.querySelector('#register-email');
                if (emailInput) emailInput.focus();
            }, 100);
        }
    }

    hide() {
        const overlay = this.container.querySelector('.register-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            this.isVisible = false;
        }

        const form = this.container.querySelector('#register-form');
        const errorDiv = this.container.querySelector('#register-error');
        const successDiv = this.container.querySelector('#register-success');

        if (form) form.reset();
        if (errorDiv) errorDiv.style.display = 'none';
        if (successDiv) successDiv.style.display = 'none';
    }

    showSuccess(message) {
        const successDiv = this.container.querySelector('#register-success');
        successDiv.textContent = message;
        successDiv.style.display = 'block';

        // Скрываем ошибку если была
        this.container.querySelector('#register-error').style.display = 'none';
    }
}