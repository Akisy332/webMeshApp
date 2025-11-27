export class Navbar {
    private container: HTMLElement;
    private dropdown: HTMLElement | null;

    constructor(containerId: string) {
        this.container = document.getElementById(containerId)!;
        this.init();
    }
    private init(): void {
        this.bindEvents();
        console.debug('Navbar component initialized');
    }

    private bindEvents(): void {
        // Обработка кнопок аутентификации (только если пользователь не авторизован)
        this.bindAuthButtons();
        
        // Управление dropdown меню (только если пользователь авторизован)
        this.bindDropdown();
        
        // Навигационные ссылки
        this.bindNavigation();
    }

    private bindAuthButtons(): void {
        const loginBtn = this.container.querySelector('.login-btn');
        const registerBtn = this.container.querySelector('.register-btn');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('auth:show-login'));
            });
        }

        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('auth:show-register'));
            });
        }
    }

    private bindDropdown(): void {
        const userBtn = this.container.querySelector('.user-btn');
        this.dropdown = this.container.querySelector('.dropdown-menu');
        const logoutBtn = this.container.querySelector('.logout-btn');

        if (userBtn && this.dropdown) {
            userBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }

        // Закрытие dropdown при клике вне
        document.addEventListener('click', () => {
            this.hideDropdown();
        });

        // Закрытие dropdown при нажатии Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideDropdown();
            }
        });
    }

    private bindNavigation(): void {
        const navLinks = this.container.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                this.handleNavigation(e);
            });
        });
    }

    private toggleDropdown(): void {
        if (!this.dropdown) return;

        const isVisible = this.dropdown.style.display === 'block';
        if (isVisible) {
            this.hideDropdown();
        } else {
            this.showDropdown();
        }
    }

    private showDropdown(): void {
        if (!this.dropdown) return;

        this.dropdown.style.display = 'block';
        this.dropdown.style.opacity = '0';
        this.dropdown.style.transform = 'translateY(-10px)';

        requestAnimationFrame(() => {
            if (this.dropdown) {
                this.dropdown.style.transition = 'all 0.2s ease';
                this.dropdown.style.opacity = '1';
                this.dropdown.style.transform = 'translateY(0)';
            }
        });
    }

    private hideDropdown(): void {
        if (!this.dropdown || this.dropdown.style.display !== 'block') return;

        this.dropdown.style.opacity = '0';
        this.dropdown.style.transform = 'translateY(-10px)';

        setTimeout(() => {
            if (this.dropdown) {
                this.dropdown.style.display = 'none';
            }
        }, 200);
    }

    private async handleLogout(): Promise<void> {
        if (confirm('Вы уверены, что хотите выйти?')) {
            try {
                this.showLoadingState();
                const response = await fetch('/api/auth/logout', { 
                    method: 'POST',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    // Перезагружаем страницу для обновления navbar (серверный рендеринг)
                    window.location.reload();
                } else {
                    throw new Error('Logout failed');
                }
            } catch (error) {
                console.error('Logout error:', error);
                this.showNotification('Ошибка при выходе', 'error');
            } finally {
                this.hideLoadingState();
            }
        }
    }

    private handleNavigation(event: Event): void {
        const link = event.currentTarget as HTMLElement;
        console.log('Navigation to:', link.dataset.page);
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

    private showNotification(message: string, type: string = 'info'): void {
        // Используем глобальную функцию уведомлений из MainApp
        if (window.showNotification) {
            window.showNotification(message, type);
        }
    }

    public destroy(): void {
        // Очистка событий
        document.removeEventListener('click', this.hideDropdown);
        document.removeEventListener('keydown', this.handleKeydown);
        
        const loginBtn = this.container.querySelector('.login-btn');
        const registerBtn = this.container.querySelector('.register-btn');
        const userBtn = this.container.querySelector('.user-btn');
        const logoutBtn = this.container.querySelector('.logout-btn');

        if (loginBtn) loginBtn.replaceWith(loginBtn.cloneNode(true));
        if (registerBtn) registerBtn.replaceWith(registerBtn.cloneNode(true));
        if (userBtn) userBtn.replaceWith(userBtn.cloneNode(true));
        if (logoutBtn) logoutBtn.replaceWith(logoutBtn.cloneNode(true));
    }

    private handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            this.hideDropdown();
        }
    };
}