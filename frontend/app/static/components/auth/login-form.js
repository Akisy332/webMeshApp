/**
 * Login Form Component
 */
class LoginForm {
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
        // Добавляем форму логина в контейнер, не перезаписывая его
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

        // Добавляем HTML в контейнер
        this.container.insertAdjacentHTML('beforeend', loginHTML);
    }

    bindEvents() {
        const closeBtn = this.container.querySelector('.close-btn');
        const overlay = this.container.querySelector('.auth-overlay');
        const form = this.container.querySelector('#login-form');
        const switchLink = this.container.querySelector('.switch-to-register');

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

    async handleLogin() {
        const form = this.container.querySelector('#login-form');
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');
        const errorDiv = this.container.querySelector('#login-error');

        const username = form.querySelector('#login-username').value;
        const password = form.querySelector('#login-password').value;

        // Валидация
        if (!username || !password) {
            this.showError('Заполните все поля');
            return;
        }

        // Показываем индикатор загрузки
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        try {
            const result = await authManager.login(username, password);

            if (result.success) {
                this.hide();
                this.showSuccess(`Добро пожаловать, ${result.user.username}!`);
            } else {
                this.showError(result.error || 'Ошибка входа');
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
        const overlay = this.container.querySelector('.login-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            this.isVisible = true;

            setTimeout(() => {
                const usernameInput = this.container.querySelector('#login-username');
                if (usernameInput) usernameInput.focus();
            }, 100);
        }
    }

    hide() {
        const overlay = this.container.querySelector('.login-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            this.isVisible = false;
        }
    }


    showError(message) {
        const errorDiv = this.container.querySelector('#login-error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';

        // Автоскрытие через 5 секунд
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    showSuccess(message) {
        // Можно показать toast уведомление
        if (window.showNotification) {
            window.showNotification(message, 'success');
        } else {
            alert(message); // Fallback
        }
    }
}