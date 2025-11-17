class AuthManager {
    constructor() {
        this.user = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        // Проверяем аутентификацию при загрузке
        await this.checkAuth();
        this.isInitialized = true;
        console.log('Auth Manager initialized (Cookies mode)');
    }

    async register(email, username, password) {
        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ email, username, password })
            });

            if (response.ok) {
                const data = await response.json();
                return { success: true, user: data.user };
            } else {
                const errorData = await response.json();
                return { success: false, error: errorData.detail || 'Registration failed' };
            }
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: 'Network error' };
        }
    }

    async checkAuth() {
        try {
            const response = await this.apiRequest('/api/auth/current-user');

            if (response.success) {
                this.user = response.data;
                this.onAuthStateChange(true);
                return true;
            } else {
                this.user = null;
                this.onAuthStateChange(false);
                return false;
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.user = null;
            this.onAuthStateChange(false);
            return false;
        }
    }

    async login(username, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.onAuthStateChange(true);
                return { success: true, user: data.user };
            } else {
                const errorData = await response.json();
                return { success: false, error: errorData.detail || 'Login failed' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error' };
        }
    }

    async logout() {
        try {
            await this.apiRequest('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.user = null;
            this.onAuthStateChange(false);
        }
    }

async apiRequest(url, options = {}) {
        const config = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);

            // Если 401 - пользователь не авторизован, это нормально
            if (response.status === 401) {
                console.log('User not authenticated');
                throw new Error('Authentication required');
            }

            // Для других ошибок пробуем refresh
            if (response.status === 403) {
                console.log('Access token expired, attempting refresh...');
                try {
                    await this.refreshTokens();
                    // Повторяем оригинальный запрос
                    const retryResponse = await fetch(url, config);
                    return await this.handleResponse(retryResponse);
                } catch (refreshError) {
                    this.onAuthStateChange(false);
                    throw new Error('Authentication required');
                }
            }

            return await this.handleResponse(response);
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    async refreshTokens() {
        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Token refresh failed');
            }

            console.log('Tokens refreshed successfully');
            return true;
        } catch (error) {
            console.error('Token refresh error:', error);
            throw error;
        }
    }

    async handleResponse(response) {
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
            const data = await response.json();
            return response.ok ?
                { success: true, data } :
                { success: false, error: data.detail || data.error || 'Request failed' };
        }

        const text = await response.text();
        return response.ok ?
            { success: true, data: text } :
            { success: false, error: `HTTP ${response.status}` };
    }

    // Проверка прав и ролей
    hasRole(requiredRole) {
        if (!this.user) return false;

        const roleHierarchy = {
            'developer': 4,
            'admin': 3,
            'curator': 2,
            'user': 1,
            'public': 0
        };

        const userLevel = roleHierarchy[this.user.role] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 0;

        return userLevel >= requiredLevel;
    }

    isAdmin() {
        return this.hasRole('admin');
    }

    can(permission) {
        if (!this.user) return false;

        const permissions = {
            'manage_users': ['admin', 'developer'],
            'view_analytics': ['admin', 'developer', 'curator'],
            'edit_content': ['admin', 'developer', 'curator'],
            'basic_access': ['user', 'admin', 'developer', 'curator']
        };

        const allowedRoles = permissions[permission] || [];
        return allowedRoles.includes(this.user.role);
    }

    // События и обновление UI
    onAuthStateChange(authenticated) {
        if (authenticated) {
            console.log('User authenticated:', this.user?.username);
            document.dispatchEvent(new CustomEvent('auth:login', {
                detail: { user: this.user }
            }));

            // Загружаем админ-функции если нужно
            if (this.isAdmin()) {
                this.loadAdminFeatures();
            }

            // Обновляем UI
            this.updateUIForAuth();
        } else {
            console.log('🚪 User logged out');
            document.dispatchEvent(new CustomEvent('auth:logout'));
            this.updateUIForUnauth();
        }
    }

    updateUIForAuth() {
        // Показываем элементы для авторизованных пользователей
        document.querySelectorAll('[data-auth-only]').forEach(el => {
            el.style.display = 'block';
        });

        // Показываем админ-элементы если пользователь админ
        if (this.isAdmin()) {
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                el.style.display = 'block';
            });
        }

        // Обновляем информацию о пользователе
        const userElements = document.querySelectorAll('[data-user-info]');
        userElements.forEach(el => {
            const field = el.dataset.userInfo;
            if (field === 'username' && this.user) {
                el.textContent = this.user.username;
            }
        });
    }

    updateUIForUnauth() {
        // Скрываем элементы для авторизованных пользователей
        document.querySelectorAll('[data-auth-only]').forEach(el => {
            el.style.display = 'none';
        });

        document.querySelectorAll('[data-admin-only]').forEach(el => {
            el.style.display = 'none';
        });
    }

    async loadAdminFeatures() {
        if (this.isAdmin()) {
            try {
                // Динамически загружаем админ-модули
                await import('/static/js/admin/admin-panel.js');
                await import('/static/js/admin/user-management.js');
                console.log('🔧 Admin features loaded');
            } catch (error) {
                console.warn('Admin features not available:', error);
            }
        }
    }

    // Публичные методы
    getCurrentUser() {
        return this.user;
    }

    // Добавьте метод для принудительной проверки аутентификации
    async forceAuthCheck() {
        await this.checkAuth();
    }

    isAuthenticated() {
        return !!this.user;
    }
}

// Глобальный экземпляр
window.authManager = new AuthManager();