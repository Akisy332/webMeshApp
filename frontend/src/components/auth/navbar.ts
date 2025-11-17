import { AuthService } from '../../services/auth-service.js';
import type { User } from '../../types/index.js';

export class AuthNavbar {
    private container: HTMLElement;
    private authState: 'loading' | 'authenticated' | 'unauthenticated';
    private user: User | null;
    private authService: AuthService;

    constructor(containerId: string, authService: AuthService) {
        this.container = document.getElementById(containerId)!;
        this.authState = 'loading';
        this.user = null;
        this.authService = authService;

        this.init();
    }

    private async init(): Promise<void> {
        this.render();
        this.bindEvents();

        // Ждем инициализации authService
        await this.waitForAuthService();
        
        // Устанавливаем начальное состояние
        this.authState = 'loading';
        this.updateAuthState();

        // Ждем завершения проверки аутентификации
        await this.waitForAuthCheck();

        // Слушаем события аутентификации
        document.addEventListener('auth:login', (e) => {
            const event = e as CustomEvent<{ user: User }>;
            this.user = event.detail.user;
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

    private async waitForAuthService(): Promise<void> {
        return new Promise((resolve) => {
            const check = () => {
                if (this.authService) {
                    resolve();
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
    }

    private async waitForAuthCheck(): Promise<void> {
        const currentUser = this.authService.getCurrentUser();
        this.user = currentUser;
        this.authState = currentUser ? 'authenticated' : 'unauthenticated';
        this.updateAuthState();
    }

    private render(): void {
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

    private bindEvents(): void {
        // Кнопки аутентификации
        const loginBtn = this.container.querySelector('.login-btn') as HTMLButtonElement;
        const registerBtn = this.container.querySelector('.register-btn') as HTMLButtonElement;

        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                this.showLoginModal();
            });
        }

        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                this.showRegisterModal();
            });
        }

        // Меню пользователя
        const userBtn = this.container.querySelector('.user-btn') as HTMLButtonElement;
        const logoutBtn = this.container.querySelector('.logout-btn') as HTMLAnchorElement;
        const profileBtn = this.container.querySelector('.profile-btn') as HTMLAnchorElement;
        const adminBtn = this.container.querySelector('.admin-btn') as HTMLAnchorElement;

        if (userBtn) {
            userBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleUserDropdown();
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }

        if (profileBtn) {
            profileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showProfile();
            });
        }

        if (adminBtn) {
            adminBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateToAdmin();
            });
        }

        // Закрытие dropdown при клике вне
        document.addEventListener('click', () => {
            this.hideUserDropdown();
        });

        // Навигационные ссылки
        const navLinks = this.container.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                this.handleNavigation(e);
            });
        });
    }

    private updateAuthState(): void {
        const unauthenticatedSection = this.container.querySelector('.unauthenticated') as HTMLElement;
        const authenticatedSection = this.container.querySelector('.authenticated') as HTMLElement;
        const loadingSection = this.container.querySelector('.loading') as HTMLElement;

        // Обновляем отображение секций
        if (this.authState === 'loading') {
            if (unauthenticatedSection) unauthenticatedSection.style.display = 'none';
            if (authenticatedSection) authenticatedSection.style.display = 'none';
            if (loadingSection) loadingSection.style.display = 'flex';
            return;
        }

        if (this.authService.isAuthenticated() && this.user) {
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

    private updateUserInfo(): void {
        if (!this.user) return;

        const usernameElement = this.container.querySelector('.username') as HTMLElement;
        const roleBadgeElement = this.container.querySelector('.user-role-badge') as HTMLElement;

        if (usernameElement) {
            usernameElement.textContent = this.user.username;
        }

        if (roleBadgeElement) {
            // Создаем badge в зависимости от роли
            const role = this.user.role || 'user';
            const roleConfig: Record<string, { text: string; color: string; bgColor: string }> = {
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

    private toggleAdminElements(): void {
        const isAdmin = this.authService.isAdmin();
        const adminLinks = this.container.querySelectorAll('.admin-only');
        const adminMenuItems = this.container.querySelector('.admin-menu-items') as HTMLElement;

        // Навигационные ссылки для админов
        adminLinks.forEach(link => {
            (link as HTMLElement).style.display = isAdmin ? 'flex' : 'none';
        });

        // Пункты меню для админов
        if (adminMenuItems) {
            adminMenuItems.style.display = isAdmin ? 'block' : 'none';
        }
    }

    private toggleUserDropdown(): void {
        const dropdown = this.container.querySelector('.dropdown-menu') as HTMLElement;
        const isVisible = dropdown.style.display === 'block';

        if (isVisible) {
            this.hideUserDropdown();
        } else {
            this.showUserDropdown();
        }
    }

    private showUserDropdown(): void {
        const dropdown = this.container.querySelector('.dropdown-menu') as HTMLElement;
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

    private hideUserDropdown(): void {
        const dropdown = this.container.querySelector('.dropdown-menu') as HTMLElement;
        if (dropdown.style.display === 'block') {
            dropdown.style.opacity = '0';
            dropdown.style.transform = 'translateY(-10px)';

            setTimeout(() => {
                dropdown.style.display = 'none';
            }, 200);
        }
    }

    private async handleLogout(): Promise<void> {
        if (confirm('Вы уверены, что хотите выйти?')) {
            try {
                this.showLoadingState();
                await this.authService.logout();
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

    private showLoadingState(): void {
        const userBtn = this.container.querySelector('.user-btn') as HTMLButtonElement;
        if (userBtn) {
            userBtn.disabled = true;
            userBtn.style.opacity = '0.6';
        }
    }

    private hideLoadingState(): void {
        const userBtn = this.container.querySelector('.user-btn') as HTMLButtonElement;
        if (userBtn) {
            userBtn.disabled = false;
            userBtn.style.opacity = '1';
        }
    }

    private showLoginModal(): void {
        document.dispatchEvent(new CustomEvent('auth:show-login'));
    }

    private showRegisterModal(): void {
        document.dispatchEvent(new CustomEvent('auth:show-register'));
    }

    private showProfile(): void {
        this.hideUserDropdown();
        this.showNotification('Функция профиля в разработке', 'info');
    }

    private navigateToAdmin(): void {
        this.hideUserDropdown();
        window.location.href = '/admin';
    }

    private handleNavigation(event: Event): void {
        const link = event.currentTarget as HTMLElement;
        this.setActiveLink(link.dataset.page || '');
    }

    private setActiveLink(activePage: string): void {
        const navLinks = this.container.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.classList.toggle('active', (link as HTMLElement).dataset.page === activePage);
        });
    }

    private showNotification(message: string, type: string = 'info'): void {
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

            const bgColors: Record<string, string> = {
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

    public forceUpdateAuthState(): void {
        this.user = this.authService.getCurrentUser();
        this.authState = this.authService.isAuthenticated() ? 'authenticated' : 'unauthenticated';
        this.updateAuthState();
    }
}