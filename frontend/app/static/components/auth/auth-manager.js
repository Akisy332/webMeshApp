/**
 * Auth Manager - управление аутентификацией на клиенте
 */
class AuthManager {
    constructor() {
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;
        this.tokenRefreshInterval = null;
        this.isRefreshing = false;
        this.refreshPromise = null;

        this.init();
    }

    init() {
        // Загружаем токены из localStorage
        this.loadTokens();

        // Настраиваем интервал для автоматического обновления токенов
        this.setupTokenRefresh();

        // Добавляем интерцептор для запросов
        this.setupRequestInterceptor();

        console.log('🔐 Auth Manager initialized');
    }

    loadTokens() {
        this.accessToken = localStorage.getItem('access_token');
        this.refreshToken = localStorage.getItem('refresh_token');
        const userData = localStorage.getItem('user_data');

        if (userData) {
            try {
                this.user = JSON.parse(userData);
            } catch (e) {
                console.error('Error parsing user data:', e);
                this.clearAuth();
            }
        }
    }

    saveTokens(accessToken, refreshToken, user) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.user = user;

        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('user_data', JSON.stringify(user));
    }

    clearAuth() {
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;

        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_data');

        if (this.tokenRefreshInterval) {
            clearInterval(this.tokenRefreshInterval);
        }

        // Уведомляем о выходе
        this.onLogout();
    }

    async login(username, password) {
        try {
            const response = await this.apiRequest('/auth/login', 'POST', {
                username,
                password
            });

            if (response.success) {
                this.saveTokens(
                    response.data.access_token,
                    response.data.refresh_token,
                    response.data.user
                );

                this.setupTokenRefresh();
                this.onLogin(response.data.user);

                return { success: true, user: response.data.user };
            } else {
                return { success: false, error: response.error };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error' };
        }
    }

    async register(email, username, password) {
        try {
            const response = await this.apiRequest('/auth/register', 'POST', {
                email,
                username,
                password
            });

            if (response.success) {
                return { success: true, user: response.data };
            } else {
                return { success: false, error: response.error };
            }
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: 'Network error' };
        }
    }

    async refreshTokens() {
        if (this.isRefreshing) {
            return this.refreshPromise;
        }

        this.isRefreshing = true;

        this.refreshPromise = new Promise(async (resolve, reject) => {
            try {
                if (!this.refreshToken) {
                    throw new Error('No refresh token available');
                }

                const response = await fetch('/auth/refresh', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        refresh_token: this.refreshToken
                    })
                });

                if (response.ok) {
                    const data = await response.json();

                    this.saveTokens(
                        data.access_token,
                        data.refresh_token,
                        data.user
                    );

                    console.log('🔄 Tokens refreshed successfully');
                    resolve(true);
                } else {
                    throw new Error('Token refresh failed');
                }
            } catch (error) {
                console.error('Token refresh error:', error);
                this.clearAuth();
                reject(error);
            } finally {
                this.isRefreshing = false;
                this.refreshPromise = null;
            }
        });

        return this.refreshPromise;
    }

    async logout() {
        try {
            if (this.refreshToken) {
                await this.apiRequest('/auth/logout', 'POST', {
                    refresh_token: this.refreshToken
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuth();
        }
    }

    async apiRequest(url, method = 'GET', data = null) {
        const config = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        // Добавляем access token если есть
        if (this.accessToken) {
            config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        if (data && (method === 'POST' || method === 'PUT')) {
            config.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, config);

            // Если 401 - пробуем обновить токен и повторить запрос
            if (response.status === 401 && this.refreshToken) {
                console.log('🔄 Token expired, attempting refresh...');

                try {
                    await this.refreshTokens();

                    // Повторяем запрос с новым токеном
                    if (this.accessToken) {
                        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
                    }

                    const retryResponse = await fetch(url, config);
                    return await this.handleResponse(retryResponse);
                } catch (refreshError) {
                    this.clearAuth();
                    throw new Error('Authentication required');
                }
            }

            return await this.handleResponse(response);
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    async handleResponse(response) {
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();

            if (response.ok) {
                return { success: true, data };
            } else {
                return {
                    success: false,
                    error: data.error || data.detail || 'Request failed',
                    status: response.status
                };
            }
        } else {
            if (response.ok) {
                return { success: true, data: await response.text() };
            } else {
                return {
                    success: false,
                    error: `HTTP ${response.status}`,
                    status: response.status
                };
            }
        }
    }

    setupTokenRefresh() {
        // Очищаем предыдущий интервал
        if (this.tokenRefreshInterval) {
            clearInterval(this.tokenRefreshInterval);
        }

        // Обновляем токен каждые 10 минут (access token живет 15 минут)
        if (this.accessToken) {
            this.tokenRefreshInterval = setInterval(async () => {
                if (this.refreshToken && !this.isRefreshing) {
                    try {
                        await this.refreshTokens();
                    } catch (error) {
                        console.error('Auto token refresh failed:', error);
                    }
                }
            }, 10 * 60 * 1000); // 10 минут
        }
    }

    setupRequestInterceptor() {
        // Перехватчик для всех fetch запросов
        const originalFetch = window.fetch;

        window.fetch = async (url, options = {}) => {
            // Добавляем токен к запросам к нашему API
            if (typeof url === 'string' &&
                (url.startsWith('/api/') || url.startsWith('/auth/')) &&
                this.accessToken) {

                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${this.accessToken}`
                };
            }

            return originalFetch(url, options);
        };
    }

    isAuthenticated() {
        return !!this.accessToken && !!this.user;
    }

    getUser() {
        return this.user;
    }

    getAccessToken() {
        return this.accessToken;
    }

    // События для UI
    onLogin(user) {
        console.log('✅ User logged in:', user.username);
        // Можно добавить кастомные события или колбэки
        document.dispatchEvent(new CustomEvent('auth:login', {
            detail: { user }
        }));
    }

    onLogout() {
        console.log('🚪 User logged out');
        document.dispatchEvent(new CustomEvent('auth:logout'));
    }

    // Проверка ролей и прав
    hasRole(role) {
        if (!this.user) return false;

        // Простая проверка - можно расширить для разных ролей
        if (role === 'admin' || role === 'superuser') {
            return this.user.is_superuser === true;
        }

        return true; // Для обычных пользователей
    }

    can(permission) {
        // Можно расширить для проверки конкретных прав
        if (!this.user) return false;

        // Пока просто проверяем суперпользователя
        if (permission === 'manage_users' || permission === 'admin') {
            return this.user.is_superuser === true;
        }

        return true; // Базовые права для всех аутентифицированных
    }
}

// Создаем глобальный экземпляр
window.authManager = new AuthManager();

