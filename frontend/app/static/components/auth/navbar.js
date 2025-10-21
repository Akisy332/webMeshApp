/**
 * Navigation Bar with Authentication
 */
class AuthNavbar {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.authState = 'unknown'; // unknown, authenticated, unauthenticated

        this.init();
    }

    init() {
        this.render();
        this.bindEvents();
        this.updateAuthState();

        // Слушаем события аутентификации
        document.addEventListener('auth:login', () => this.updateAuthState());
        document.addEventListener('auth:logout', () => this.updateAuthState());
    }

    render() {
        this.container.innerHTML = `
            <nav class="navbar">
                <div class="nav-brand">
                    <a href="/">Telemetry System</a>
                </div>
                
                <div class="nav-links">
                    <a href="/" class="nav-link">Главная</a>
                    <a href="/table" class="nav-link">Таблица</a>
                    <a href="/database" class="nav-link">База данных</a>
                </div>
                
                <div class="nav-auth">
                    <!-- Неавторизованное состояние -->
                    <div class="auth-section unauthenticated style="display: none; display: flex; gap: 8px;">
                        <button class="btn btn-outline login-btn">Войти</button>
                        <button class="btn btn-primary register-btn">Регистрация</button>
                    </div>
                    
                    <!-- Авторизованное состояние -->
                    <div class="auth-section authenticated" style="display: none;">
                        <div class="user-menu">
                            <span class="user-greeting">Привет, <span class="username"></span>!</span>
                            <div class="user-dropdown">
                                <button class="user-btn">
                                    <span class="user-avatar"></span>
                                    <span class="user-name"></span>
                                    <span class="dropdown-arrow">▼</span>
                                </button>
                                <div class="dropdown-menu">
                                    <a href="#" class="dropdown-item profile-btn">Профиль</a>
                                    <a href="#" class="dropdown-item settings-btn">Настройки</a>
                                    <div class="dropdown-divider"></div>
                                    <a href="#" class="dropdown-item logout-btn">Выйти</a>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Состояние загрузки -->
                    <div class="auth-section loading" style="display: none;">
                        <span class="loading-text">Загрузка...</span>
                    </div>
                </div>
            </nav>
        `;
    }

    bindEvents() {
        // Кнопки аутентификации
        this.container.querySelector('.login-btn')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('auth:show-login'));
        });

        this.container.querySelector('.register-btn')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('auth:show-register'));
        });

        // Меню пользователя
        this.container.querySelector('.user-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleUserDropdown();
        });

        this.container.querySelector('.logout-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        this.container.querySelector('.profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showProfile();
        });

        // Закрытие dropdown при клике вне
        document.addEventListener('click', () => {
            this.hideUserDropdown();
        });
    }

    updateAuthState() {
        const unauthenticatedSection = this.container.querySelector('.unauthenticated');
        const authenticatedSection = this.container.querySelector('.authenticated');
        const loadingSection = this.container.querySelector('.loading');

        if (authManager.isAuthenticated()) {
            this.authState = 'authenticated';
            unauthenticatedSection.style.display = 'none';
            authenticatedSection.style.display = 'block';
            loadingSection.style.display = 'none';

            // Обновляем информацию пользователя
            const user = authManager.getUser();
            this.container.querySelector('.username').textContent = user.username;
            this.container.querySelector('.user-name').textContent = user.username;

            // Показываем badge для администраторов
            if (user.is_superuser) {
                this.showAdminBadge();
            }

        } else {
            this.authState = 'unauthenticated';
            unauthenticatedSection.style.display = 'flex';
            authenticatedSection.style.display = 'none';
            loadingSection.style.display = 'none';
        }
    }

    showAdminBadge() {
        const userBtn = this.container.querySelector('.user-btn');
        if (userBtn && !userBtn.querySelector('.admin-badge')) {
            const badge = document.createElement('span');
            badge.className = 'admin-badge';
            badge.textContent = 'ADMIN';
            badge.style.cssText = `
                background: #dc3545;
                color: white;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                margin-left: 8px;
            `;
            userBtn.appendChild(badge);
        }
    }

    toggleUserDropdown() {
        const dropdown = this.container.querySelector('.dropdown-menu');
        if (dropdown.style.display === 'block') {
            this.hideUserDropdown();
        } else {
            this.showUserDropdown();
        }
    }

    showUserDropdown() {
        const dropdown = this.container.querySelector('.dropdown-menu');
        dropdown.style.display = 'block';
    }

    hideUserDropdown() {
        const dropdown = this.container.querySelector('.dropdown-menu');
        dropdown.style.display = 'none';
    }

    async handleLogout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            try {
                await authManager.logout();
                this.hideUserDropdown();
                this.showNotification('Вы успешно вышли из системы', 'success');
            } catch (error) {
                console.error('Logout error:', error);
                this.showNotification('Ошибка при выходе', 'error');
            }
        }
    }

    showProfile() {
        // Можно открыть модальное окно профиля
        this.hideUserDropdown();
        this.showNotification('Функция профиля в разработке', 'info');
    }

    showNotification(message, type = 'info') {
        // Используем существующую систему уведомлений или создаем простую
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            alert(message);
        }
    }
}