class AuthNavbar {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.authState = 'loading'; // loading, authenticated, unauthenticated
        this.user = null;

        this.init();
    }

    async init() {
    this.render();
    this.bindEvents();

    // Ждем инициализации authManager
    if (!window.authManager) {
        console.warn('AuthManager not found, waiting...');
        setTimeout(() => this.init(), 100);
        return;
    }

    // Устанавливаем начальное состояние
    this.authState = 'loading';
    this.updateAuthState();

    // Ждем завершения проверки аутентификации
    await this.waitForAuthCheck();

    // Слушаем события аутентификации
    document.addEventListener('auth:login', (e) => {
        this.user = e.detail.user;
        this.authState = 'authenticated';
        this.updateAuthState();
    });

    document.addEventListener('auth:logout', () => {
        this.user = null;
        this.authState = 'unauthenticated';
        this.updateAuthState();
    });

    console.log('AuthNavbar initialized');
}

forceUpdateAuthState() {
    if (window.authManager) {
        this.user = authManager.getCurrentUser();
        this.authState = authManager.isAuthenticated() ? 'authenticated' : 'unauthenticated';
        this.updateAuthState();
    }
}

    async waitForAuthCheck() {
        // Ждем пока authManager проверит аутентификацию
        return new Promise((resolve) => {
            const check = () => {
                if (window.authManager && window.authManager.isInitialized) {
                    this.user = authManager.getCurrentUser();
                    // Сразу обновляем состояние после получения данных
                    this.authState = authManager.isAuthenticated() ? 'authenticated' : 'unauthenticated';
                    this.updateAuthState();
                    resolve();
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
}

    render() {
        this.container.innerHTML = `
            <nav class="navbar">
                <div class="nav-brand">
                    <a href="/" class="brand-link">
                        <span class="brand-icon"></span>
                        WebMeshApp
                    </a>
                </div>

                <div class="nav-links">
                    <a href="/" class="nav-link" data-page="home">
                        <span class="nav-icon"></span>
                        Главная
                    </a>
                    <a href="/table" class="nav-link" data-page="table">
                        <span class="nav-icon"></span>
                        Таблица данных
                    </a>
                    <a href="/database" class="nav-link" data-page="database">
                        <span class="nav-icon"></span>
                        База данных
                    </a>

                    <!-- Админские ссылки (появятся только для админов) -->
                    <a href="/admin" class="nav-link admin-only" data-page="admin" style="display: none;">
                        <span class="nav-icon"></span>
                        Администрирование
                    </a>
                </div>

                <div class="nav-auth">
                    <!-- Состояние загрузки -->
                    <div id="nav-loading" class="auth-section loading" style="display: flex; align-items: center; gap: 10px;">
                        <div class="spinner"></div>
                        <span class="loading-text">Проверка...</span>
                    </div>

                    <!-- Неавторизованное состояние -->
                    <div id="nav-unauthenticated" class="auth-section unauthenticated" style="display: none;">
                        <div class="auth-buttons">
                            <button class="btn btn-outline login-btn" id="nav-login-btn">
                                <span class="btn-icon"></span>
                                Войти
                            </button>
                            <button class="btn btn-primary register-btn" id="nav-register-btn">
                                <span class="btn-icon"></span>
                                Регистрация
                            </button>
                        </div>
                    </div>

                    <!-- Авторизованное состояние -->
                    <div id="nav-authenticated" class="auth-section authenticated" style="display: none;">
                        <div class="user-menu">
                            <div class="user-info">
                                <span class="user-greeting">Привет, </span>
                                <span id="nav-username" class="username"></span>
                                <span id="nav-admin-badge" class="user-role-badge" style="display: none;">ADMIN</span>
                            </div>
                            <div class="user-dropdown">
                                <button class="user-btn">
                                    <div class="user-avatar">
                                        <span class="avatar-icon"></span>
                                    </div>
                                    <span class="dropdown-arrow">▼</span>
                                </button>
                                <div class="dropdown-menu">
                                    <a href="#" class="dropdown-item profile-btn" id="nav-profile-btn">
                                        <span class="item-icon"></span>
                                        Профиль
                                    </a>
                                    <a href="#" class="dropdown-item settings-btn">
                                        <span class="item-icon"></span>
                                        Настройки
                                    </a>

                                    <!-- Админские пункты меню -->
                                    <div class="admin-menu-items" style="display: none;">
                                        <div class="dropdown-divider"></div>
                                        <a href="/admin" class="dropdown-item admin-btn">
                                            <span class="item-icon"></span>
                                            Админ-панель
                                        </a>
                                        <a href="#" class="dropdown-item system-btn">
                                            <span class="item-icon"></span>
                                            Система
                                        </a>
                                    </div>

                                    <div class="dropdown-divider"></div>
                                    <a href="#" class="dropdown-item logout-btn" id="nav-logout-btn">
                                        <span class="item-icon"></span>
                                        Выйти
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>
        `;
    }

    bindEvents() {
        // Кнопки аутентификации
        this.container.querySelector('.login-btn')?.addEventListener('click', () => {
            this.showLoginModal();
        });

        this.container.querySelector('.register-btn')?.addEventListener('click', () => {
            this.showRegisterModal();
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

        this.container.querySelector('.admin-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.navigateToAdmin();
        });

        // Закрытие dropdown при клике вне
        document.addEventListener('click', () => {
            this.hideUserDropdown();
        });

        // Навигационные ссылки
        this.container.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                this.handleNavigation(e);
            });
        });
    }

    updateAuthState() {
    const unauthenticatedSection = this.container.querySelector('.unauthenticated');
    const authenticatedSection = this.container.querySelector('.authenticated');
    const loadingSection = this.container.querySelector('.loading');

    // Обновляем отображение секций
    if (this.authState === 'loading') {
        if (unauthenticatedSection) unauthenticatedSection.style.display = 'none';
        if (authenticatedSection) authenticatedSection.style.display = 'none';
        if (loadingSection) loadingSection.style.display = 'flex';
        return;
    }

    if (authManager.isAuthenticated() && this.user) {
        this.authState = 'authenticated';
        if (unauthenticatedSection) unauthenticatedSection.style.display = 'none';
        if (authenticatedSection) authenticatedSection.style.display = 'block';
        if (loadingSection) loadingSection.style.display = 'none';

        // Обновляем информацию пользователя
        this.updateUserInfo();

        // Показываем админские элементы если пользователь админ
        this.toggleAdminElements();

    } else {
        this.authState = 'unauthenticated';
        if (unauthenticatedSection) unauthenticatedSection.style.display = 'block';
        if (authenticatedSection) authenticatedSection.style.display = 'none';
        if (loadingSection) loadingSection.style.display = 'none';

        // Скрываем админские элементы
        this.toggleAdminElements();
    }
}

    updateUserInfo() {
        if (!this.user) return;

        const usernameElement = this.container.querySelector('.username');
        const roleBadgeElement = this.container.querySelector('.user-role-badge');

        if (usernameElement) {
            usernameElement.textContent = this.user.username;
        }

        if (roleBadgeElement) {
            // Создаем badge в зависимости от роли
            const role = this.user.role || 'user';
            const roleConfig = {
                'developer': { text: 'DEVELOPER', color: '#6f42c1', bgColor: '#e9ecef' },
                'admin': { text: 'ADMIN', color: '#dc3545', bgColor: '#f8d7da' },
                'curator': { text: 'CURATOR', color: '#fd7e14', bgColor: '#fff3cd' },
                'user': { text: 'USER', color: '#0d6efd', bgColor: '#cfe2ff' }
            };

            const config = roleConfig[role] || roleConfig.user;

            roleBadgeElement.textContent = config.text;
            roleBadgeElement.style.cssText = `
                background: ${config.bgColor};
                color: ${config.color};
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                margin-left: 8px;
                font-weight: bold;
                border: 1px solid ${config.color}20;
            `;
        }
    }

    toggleAdminElements() {
        const isAdmin = authManager.isAdmin();
        const adminLinks = this.container.querySelectorAll('.admin-only');
        const adminMenuItems = this.container.querySelector('.admin-menu-items');

        // Навигационные ссылки для админов
        adminLinks.forEach(link => {
            link.style.display = isAdmin ? 'flex' : 'none';
        });

        // Пункты меню для админов
        if (adminMenuItems) {
            adminMenuItems.style.display = isAdmin ? 'block' : 'none';
        }
    }

    toggleUserDropdown() {
        const dropdown = this.container.querySelector('.dropdown-menu');
        const isVisible = dropdown.style.display === 'block';

        if (isVisible) {
            this.hideUserDropdown();
        } else {
            this.showUserDropdown();
        }
    }

    showUserDropdown() {
        const dropdown = this.container.querySelector('.dropdown-menu');
        dropdown.style.display = 'block';

        // Добавляем анимацию
        dropdown.style.opacity = '0';
        dropdown.style.transform = 'translateY(-10px)';

        requestAnimationFrame(() => {
            dropdown.style.transition = 'all 0.2s ease';
            dropdown.style.opacity = '1';
            dropdown.style.transform = 'translateY(0)';
        });
    }

    hideUserDropdown() {
        const dropdown = this.container.querySelector('.dropdown-menu');
        if (dropdown.style.display === 'block') {
            dropdown.style.opacity = '0';
            dropdown.style.transform = 'translateY(-10px)';

            setTimeout(() => {
                dropdown.style.display = 'none';
            }, 200);
        }
    }

    async handleLogout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            try {
                this.showLoadingState();
                await authManager.logout();
                this.hideUserDropdown();
                this.showNotification('Вы успешно вышли из системы', 'success');
            } catch (error) {
                console.error('Logout error:', error);
                this.showNotification('Ошибка при выходе', 'error');
            } finally {
                this.hideLoadingState();
            }
        }
    }

    showLoadingState() {
        const userBtn = this.container.querySelector('.user-btn');
        if (userBtn) {
            userBtn.disabled = true;
            userBtn.style.opacity = '0.6';
        }
    }

    hideLoadingState() {
        const userBtn = this.container.querySelector('.user-btn');
        if (userBtn) {
            userBtn.disabled = false;
            userBtn.style.opacity = '1';
        }
    }

    showLoginModal() {
        // Используем существующую систему модальных окон
        document.dispatchEvent(new CustomEvent('auth:show-login'));
    }

    showRegisterModal() {
        document.dispatchEvent(new CustomEvent('auth:show-register'));
    }

    showProfile() {
        this.hideUserDropdown();
        // Можно открыть модальное окно профиля или перейти на страницу
        this.showNotification('Функция профиля в разработке', 'info');
    }

    navigateToAdmin() {
        this.hideUserDropdown();
        window.location.href = '/admin';
    }

    handleNavigation(event) {
        // Можно добавить логику для активных ссылок
        const link = event.currentTarget;
        this.setActiveLink(link.dataset.page);
    }

    setActiveLink(activePage) {
        this.container.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === activePage);
        });
    }

    showNotification(message, type = 'info') {
        // Используем существующую систему уведомлений
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            // Простая fallback реализация
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 10000;
                transition: all 0.3s ease;
            `;

            const bgColors = {
                success: '#28a745',
                error: '#dc3545',
                info: '#17a2b8',
                warning: '#ffc107'
            };

            notification.style.background = bgColors[type] || bgColors.info;
            notification.textContent = message;

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100px)';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.authNavbar = new AuthNavbar('navbar-container');
});