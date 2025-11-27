import { eventBus } from '../core/event-bus.js';
import { EventTypes, API_ENDPOINTS } from '../core/constants.js';
import type { User } from '../types/index.js';

export interface AuthResponse {
    success: boolean;
    user?: User;
    error?: string;
}

export class AuthService {
    private user: User | null = null;
    private isInitialized = false;

    constructor() {
        this.init();
    }

    private async init(): Promise<void> {
        if (this.isInitialized) return;

        console.log('AuthService initializing...');
        await this.checkAuth();
        this.isInitialized = true;
        console.log('AuthService initialized');
    }

    async register(email: string, username: string, password: string): Promise<AuthResponse> {
        try {
            const response = await fetch(API_ENDPOINTS.USERS, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ email, username, password }),
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

    async login(username: string, password: string): Promise<AuthResponse> {
        try {
            const response = await fetch(`${API_ENDPOINTS.AUTH}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ username, password }),
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

    async logout(): Promise<void> {
        try {
            await this.apiRequest(`${API_ENDPOINTS.AUTH}/logout`, { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.user = null;
            this.onAuthStateChange(false);
        }
    }

    async checkAuth(): Promise<boolean> {
        try {
            const response = await this.apiRequest(`${API_ENDPOINTS.AUTH}/current-user`);

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

    async apiRequest(url: string, options: RequestInit = {}): Promise<any> {
        const config: RequestInit = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        };

        try {
            const response = await fetch(url, config);

            if (response.status === 401) {
                console.log('User not authenticated');
                throw new Error('Authentication required');
            }

            if (response.status === 403) {
                console.log('Access token expired, attempting refresh...');
                try {
                    await this.refreshTokens();
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

    async refreshTokens(): Promise<boolean> {
        try {
            const response = await fetch(`${API_ENDPOINTS.AUTH}/refresh`, {
                method: 'POST',
                credentials: 'include',
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

    private async handleResponse(response: Response): Promise<any> {
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
            const data = await response.json();
            return response.ok
                ? { success: true, data }
                : { success: false, error: data.detail || data.error || 'Request failed' };
        }

        const text = await response.text();
        return response.ok ? { success: true, data: text } : { success: false, error: `HTTP ${response.status}` };
    }

    private onAuthStateChange(authenticated: boolean): void {
        if (authenticated) {
            console.log('User authenticated:', this.user?.username);
            document.dispatchEvent(
                new CustomEvent('auth:login', {
                    detail: { user: this.user },
                })
            );

            if (this.isAdmin()) {
                this.loadAdminFeatures();
            }

            this.updateUIForAuth();
        } else {
            console.log('User logged out');
            document.dispatchEvent(new CustomEvent('auth:logout'));
            this.updateUIForUnauth();
        }
    }

    private updateUIForAuth(): void {
        document.querySelectorAll('[data-auth-only]').forEach((el) => {
            (el as HTMLElement).style.display = 'block';
        });

        if (this.isAdmin()) {
            document.querySelectorAll('[data-admin-only]').forEach((el) => {
                (el as HTMLElement).style.display = 'block';
            });
        }

        const userElements = document.querySelectorAll('[data-user-info]');
        userElements.forEach((el) => {
            const field = (el as HTMLElement).dataset.userInfo;
            if (field === 'username' && this.user) {
                el.textContent = this.user.username;
            }
        });
    }

    private updateUIForUnauth(): void {
        document.querySelectorAll('[data-auth-only]').forEach((el) => {
            (el as HTMLElement).style.display = 'none';
        });

        document.querySelectorAll('[data-admin-only]').forEach((el) => {
            (el as HTMLElement).style.display = 'none';
        });
    }

    hasRole(requiredRole: string): boolean {
        if (!this.user) return false;

        const roleHierarchy: Record<string, number> = {
            developer: 4,
            admin: 3,
            curator: 2,
            user: 1,
            public: 0,
        };

        const userLevel = roleHierarchy[this.user.role] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 0;

        return userLevel >= requiredLevel;
    }

    isAdmin(): boolean {
        return this.hasRole('admin');
    }

    can(permission: string): boolean {
        if (!this.user) return false;

        const permissions: Record<string, string[]> = {
            manage_users: ['admin', 'developer'],
            view_analytics: ['admin', 'developer', 'curator'],
            edit_content: ['admin', 'developer', 'curator'],
            basic_access: ['user', 'admin', 'developer', 'curator'],
        };

        const allowedRoles = permissions[permission] || [];
        return allowedRoles.includes(this.user.role);
    }

    private async loadAdminFeatures(): Promise<void> {
        if (this.isAdmin()) {
            try {
                // Динамически загружаем админ-модули
                // await import('/static/js/admin/admin-panel.js');
                // await import('/static/js/admin/user-management.js');
                console.log('Admin features loaded');
            } catch (error) {
                console.warn('Admin features not available:', error);
            }
        }
    }

    getCurrentUser(): User | null {
        return this.user;
    }

    async forceAuthCheck(): Promise<void> {
        await this.checkAuth();
    }

    isAuthenticated(): boolean {
        return !!this.user;
    }
}
