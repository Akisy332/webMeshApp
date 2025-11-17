import { eventBus } from '../../core/event-bus.js';
import { EventTypes, API_ENDPOINTS } from '../../core/constants.js';
import type { Session } from '../../types/index.js';

export class SessionModalWindow {
    private allSessions: Session[] = [];
    private currentSession: Session | null = null;
    private modalElement: HTMLElement | null = null;

    constructor() {
        this.init();
    }

    private init(): void {
        console.log('SessionModalWindow initializing...');
        
        this.setupEventListeners();
        this.bindModalEvents();
        
        console.log('SessionModalWindow initialized');
    }

    private setupEventListeners(): void {
        // Подписка на события EventBus
        eventBus.on(EventTypes.SESSION.LIST_LOADED, (data: any) => {
            this.allSessions = data.sessions || [];
            this.currentSession = data.selectedSession || null;
            this.updateSessionsListUI();
        });

        eventBus.on(EventTypes.SESSION.SELECTED, (session: Session) => {
            this.currentSession = session;
            this.updateSessionsListUI();
        });

        eventBus.on(EventTypes.SESSION.UPDATED, () => {
            this.updateSessionsListUI();
        });

        // Обработчик кнопки "+" для открытия модального окна
        document.addEventListener('DOMContentLoaded', () => {
            const addDataBtn = document.getElementById('add-data');
            if (addDataBtn) {
                addDataBtn.addEventListener('click', () => {
                    this.openModal();
                });
            }
        });
    }

    private bindModalEvents(): void {
        document.addEventListener('DOMContentLoaded', () => {
            this.modalElement = document.getElementById('sessionModal');
            if (!this.modalElement) return;

            // Обработчик кнопки "Новая сессия"
            const createNewSessionBtn = document.getElementById('createNewSession');
            if (createNewSessionBtn) {
                createNewSessionBtn.addEventListener('click', () => {
                    this.showNewSessionForm();
                });
            }

            // Обработчик отмены создания новой сессии
            const cancelCreateBtn = document.getElementById('cancelCreate');
            if (cancelCreateBtn) {
                cancelCreateBtn.addEventListener('click', () => {
                    this.showEmptyState();
                });
            }

            // Обработчик сохранения новой сессии
            const newSessionForm = document.getElementById('newSessionForm') as HTMLFormElement;
            if (newSessionForm) {
                newSessionForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleCreateSession();
                });
            }

            // Обработчик отмены редактирования сессии
            const cancelEditBtn = document.getElementById('cancelEdit');
            if (cancelEditBtn) {
                cancelEditBtn.addEventListener('click', () => {
                    this.showEmptyState();
                });
            }

            // Обработчик сохранения изменений сессии
            const editSessionForm = document.getElementById('editSessionForm') as HTMLFormElement;
            if (editSessionForm) {
                editSessionForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleUpdateSession();
                });
            }

            // Обработчик удаления сессии
            const deleteSessionBtn = document.getElementById('deleteSession');
            if (deleteSessionBtn) {
                deleteSessionBtn.addEventListener('click', () => {
                    this.handleDeleteSession();
                });
            }
        });
    }

    private updateSessionsListUI(): void {
        const sessionsList = document.getElementById('sessionsList');
        if (!sessionsList) return;

        sessionsList.innerHTML = '';

        if (this.allSessions.length === 0) {
            sessionsList.innerHTML = '<div class="text-muted p-3">Нет доступных сессий</div>';
            return;
        }

        // Сортируем сессии по дате (новые сначала)
        const sortedSessions = [...this.allSessions].sort((a, b) => 
            new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
        );

        sortedSessions.forEach(session => {
            const sessionElement = document.createElement('button');
            sessionElement.className = 'list-group-item list-group-item-action';
            
            if (this.currentSession && session.id === this.currentSession.id) {
                sessionElement.classList.add('active');
            }
            
            sessionElement.innerHTML = `
                <div class="d-flex flex-column">
                    <h6 class="mb-1 fw-medium text-dark">${this.escapeHtml(session.name)}</h6>
                    <p class="session-description mb-2 text-secondary">${this.escapeHtml(session.description || 'Нет описания')}</p>
                    <small class="session-date text-muted">
                        <i class="bi bi-calendar me-1"></i>${session.datetime.split(' ')[0]}
                        <i class="bi bi-clock ms-2 me-1"></i>${session.datetime.split(' ')[1]}
                    </small>
                </div>
            `;

            sessionElement.addEventListener('click', () => {
                this.showEditSessionForm(session);
            });

            sessionsList.appendChild(sessionElement);
        });
    }

    private showEditSessionForm(session: Session): void {
        const editSessionId = document.getElementById('editSessionId') as HTMLInputElement;
        const editSessionName = document.getElementById('editSessionName') as HTMLInputElement;
        const editSessionDescription = document.getElementById('editSessionDescription') as HTMLTextAreaElement;
        const editSessionDate = document.getElementById('editSessionDate') as HTMLInputElement;

        if (editSessionId && editSessionName && editSessionDescription && editSessionDate) {
            editSessionId.value = session.id.toString();
            editSessionName.value = session.name;
            editSessionDescription.value = session.description || '';
            
            // Преобразуем datetime в формат для input[type="date"]
            const datePart = session.datetime.split(' ')[0];
            editSessionDate.value = datePart;

            this.hideEmptyState();
            this.hideNewSessionForm();
            this.showEditSessionFormUI();
        }
    }

    private openModal(): void {
        // Устанавливаем текущую дату по умолчанию для новой сессии
        const newSessionDate = document.getElementById('newSessionDate') as HTMLInputElement;
        if (newSessionDate) {
            newSessionDate.valueAsDate = new Date();
        }

        // Показываем модальное окно через Bootstrap
        if (this.modalElement && (window as any).bootstrap) {
            const modal = new (window as any).bootstrap.Modal(this.modalElement);
            modal.show();
        }
    }

    private showNewSessionForm(): void {
        this.hideEmptyState();
        this.hideEditSessionForm();
        this.showNewSessionFormUI();

        // Сбрасываем форму
        const newSessionForm = document.getElementById('newSessionForm') as HTMLFormElement;
        if (newSessionForm) {
            newSessionForm.reset();
        }

        const newSessionDate = document.getElementById('newSessionDate') as HTMLInputElement;
        if (newSessionDate) {
            newSessionDate.valueAsDate = new Date();
        }
    }

    private showEmptyState(): void {
        this.hideNewSessionForm();
        this.hideEditSessionForm();
        this.showEmptyStateUI();
    }

    private showNewSessionFormUI(): void {
        const newSessionForm = document.getElementById('newSessionForm') as HTMLElement;
        if (newSessionForm) {
            newSessionForm.style.display = 'block';
        }
    }

    private hideNewSessionForm(): void {
        const newSessionForm = document.getElementById('newSessionForm') as HTMLElement;
        if (newSessionForm) {
            newSessionForm.style.display = 'none';
        }
    }

    private showEditSessionFormUI(): void {
        const editSessionForm = document.getElementById('editSessionForm') as HTMLElement;
        if (editSessionForm) {
            editSessionForm.style.display = 'block';
        }
    }

    private hideEditSessionForm(): void {
        const editSessionForm = document.getElementById('editSessionForm') as HTMLElement;
        if (editSessionForm) {
            editSessionForm.style.display = 'none';
        }
    }

    private showEmptyStateUI(): void {
        const emptyState = document.getElementById('emptyState') as HTMLElement;
        if (emptyState) {
            emptyState.style.display = 'block';
        }
    }

    private hideEmptyState(): void {
        const emptyState = document.getElementById('emptyState') as HTMLElement;
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    private async handleCreateSession(): Promise<void> {
        const sessionName = document.getElementById('newSessionName') as HTMLInputElement;
        const sessionDescription = document.getElementById('newSessionDescription') as HTMLTextAreaElement;
        const sessionDate = document.getElementById('newSessionDate') as HTMLInputElement;

        if (!sessionName || !sessionDescription || !sessionDate) return;

        const sessionData = {
            name: sessionName.value,
            description: sessionDescription.value,
            date: sessionDate.value
        };

        try {
            const response = await fetch(API_ENDPOINTS.SESSIONS, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(sessionData)
            });

            if (!response.ok) throw new Error('Ошибка создания сессии');

            const newSession = await response.json();

            // Уведомляем систему об обновлении списка сессий
            eventBus.emit(EventTypes.SESSION.UPDATED);

            // Закрываем форму создания
            this.showEmptyState();

            // Закрываем модальное окно
            if (this.modalElement && (window as any).bootstrap) {
                const modal = (window as any).bootstrap.Modal.getInstance(this.modalElement);
                if (modal) {
                    modal.hide();
                }
            }

            this.showNotification('Сессия успешно создана!', 'success');

        } catch (error) {
            console.error('Ошибка:', error);
            this.showNotification('Ошибка при создании сессии', 'error');
        }
    }

    private async handleUpdateSession(): Promise<void> {
        const sessionId = document.getElementById('editSessionId') as HTMLInputElement;
        const sessionName = document.getElementById('editSessionName') as HTMLInputElement;
        const sessionDescription = document.getElementById('editSessionDescription') as HTMLTextAreaElement;
        const sessionDate = document.getElementById('editSessionDate') as HTMLInputElement;

        if (!sessionId || !sessionName || !sessionDescription || !sessionDate) return;

        const sessionData = {
            id: parseInt(sessionId.value),
            name: sessionName.value,
            description: sessionDescription.value,
            date: sessionDate.value
        };

        try {
            const response = await fetch(`${API_ENDPOINTS.SESSIONS}/${sessionData.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(sessionData)
            });

            if (!response.ok) throw new Error('Ошибка сохранения изменений');

            // Уведомляем систему об обновлении списка сессий
            eventBus.emit(EventTypes.SESSION.UPDATED);

            this.showNotification('Изменения сохранены!', 'success');

        } catch (error) {
            console.error('Ошибка:', error);
            this.showNotification('Ошибка при сохранении изменений', 'error');
        }
    }

    private async handleDeleteSession(): Promise<void> {
        const sessionId = document.getElementById('editSessionId') as HTMLInputElement;
        if (!sessionId) return;

        if (confirm('Вы уверены, что хотите удалить эту сессию?')) {
            try {
                const response = await fetch(`${API_ENDPOINTS.SESSIONS}/${sessionId.value}`, {
                    method: 'DELETE'
                });

                if (!response.ok) throw new Error('Ошибка удаления сессии');

                // Уведомляем систему об обновлении списка сессий
                eventBus.emit(EventTypes.SESSION.UPDATED);

                // Закрываем форму редактирования
                this.showEmptyState();

                this.showNotification('Сессия удалена!', 'success');

            } catch (error) {
                console.error('Ошибка:', error);
                this.showNotification('Ошибка при удалении сессии', 'error');
            }
        }
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private showNotification(message: string, type: string = 'info'): void {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            alert(message);
        }
    }
}