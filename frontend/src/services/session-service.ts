import { eventBus } from '../core/event-bus.js';
import { EventTypes, API_ENDPOINTS } from '../core/constants.js';
import type { Session } from '../types/index.js';

export class SessionService {
    private sessions: Session[] = [];
    private currentSessionId: number | null = null;
    private dataSelect: HTMLSelectElement | null = null;
    private isInitialized = false;

    constructor() {
        this.init();
    }

    private async init(): Promise<void> {
        if (this.isInitialized) return;

        console.log('SessionService (TypeScript) initializing...');
        
        // Ждем готовности DOM
        await this.waitForDom();
        
        this.setupEventListeners();
        await this.loadSessions();
        
        this.isInitialized = true;
        console.log('SessionService initialized');
    }

    private async waitForDom(): Promise<void> {
        return new Promise((resolve) => {
            const checkDom = () => {
                this.dataSelect = document.getElementById('data-select') as HTMLSelectElement;
                if (this.dataSelect && eventBus) {
                    resolve();
                } else {
                    setTimeout(checkDom, 50);
                }
            };
            checkDom();
        });
    }

    private setupEventListeners(): void {
        // Подписка на события обновления сессий
        eventBus.on(EventTypes.SESSION.UPDATED, () => {
            this.loadSessions();
        });

        // Обработчик изменения выбора сессии
        if (this.dataSelect) {
            this.dataSelect.addEventListener('change', (e) => {
                this.handleSessionChange(e);
            });
        }
    }

    private async loadSessions(): Promise<void> {
        try {
            if (!this.dataSelect) return;

            this.dataSelect.disabled = true;
            this.dataSelect.innerHTML = '<option selected disabled>Загрузка...</option>';

            const response = await fetch(API_ENDPOINTS.SESSIONS);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

            this.sessions = await response.json();

            if (this.sessions.length === 0) {
                this.dataSelect.innerHTML = '<option selected disabled>Нет доступных сессий</option>';
                eventBus.emit(EventTypes.SESSION.LIST_LOADED, { sessions: [], selectedSession: null });
                return;
            }

            // Сортируем сессии по дате (новые сначала)
            this.sessions.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

            this.updateSelectOptions();

            // Восстанавливаем выбранную сессию или выбираем первую
            await this.restoreOrSelectSession();

        } catch (error) {
            console.error('SessionService: Error loading sessions:', error);
            this.showErrorState();
            eventBus.emit(EventTypes.ERROR, 'Ошибка загрузки списка сессий');
        } finally {
            if (this.dataSelect) {
                this.dataSelect.disabled = false;
            }
        }
    }

    private updateSelectOptions(): void {
        if (!this.dataSelect) return;

        this.dataSelect.innerHTML = '';

        // Добавляем placeholder option
        const placeholderOption = new Option('Выберите сессию', '', true, true);
        placeholderOption.disabled = true;
        placeholderOption.hidden = true;
        this.dataSelect.add(placeholderOption);

        // Добавляем все сессии
        this.sessions.forEach(session => {
            this.dataSelect!.add(new Option(session.name, session.id.toString()));
        });
    }

    private async restoreOrSelectSession(): Promise<void> {
        if (this.sessions.length === 0) return;

        // Пытаемся получить сохраненный sessionId из localStorage
        const savedSessionId = localStorage.getItem('selectedSessionId');
        let sessionToSelect: Session | null = null;

        if (savedSessionId) {
            sessionToSelect = this.sessions.find(s => s.id.toString() === savedSessionId) || null;
        }

        if (!sessionToSelect) {
            sessionToSelect = this.sessions[0]; // Первая сессия как fallback
        }

        if (sessionToSelect) {
            this.currentSessionId = sessionToSelect.id;
            if (this.dataSelect) {
                this.dataSelect.value = sessionToSelect.id.toString();
            }
            localStorage.setItem('selectedSessionId', sessionToSelect.id.toString());

            await this.loadSessionData(sessionToSelect);
        }

        // Отправляем событие о загрузке списка
        eventBus.emit(EventTypes.SESSION.LIST_LOADED, {
            sessions: this.sessions,
            selectedSession: sessionToSelect
        });
    }

    private async handleSessionChange(event: Event): Promise<void> {
        const target = event.target as HTMLSelectElement;
        const sessionId = parseInt(target.value);

        if (!sessionId) return;

        this.currentSessionId = sessionId;
        localStorage.setItem('selectedSessionId', sessionId.toString());

        try {
            const selectedSession = this.sessions.find(s => s.id === sessionId);
            if (!selectedSession) {
                throw new Error('Выбранная сессия не найдена в списке');
            }

            await this.loadSessionData(selectedSession);

        } catch (error) {
            console.error('SessionService: Error loading session data:', error);
            eventBus.emit(EventTypes.ERROR, 'Ошибка загрузки данных сессии');
        }
    }

    private async loadSessionData(session: Session): Promise<void> {
        try {
            const response = await fetch(`${API_ENDPOINTS.SESSIONS}/${session.id}`);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

            const sessionData = await response.json();
            
            // Отправляем события о выбранной сессии и ее данных
            eventBus.emit(EventTypes.SESSION.SELECTED, session);
            eventBus.emit(EventTypes.SESSION.LOAD_DATA, sessionData);

        } catch (error) {
            console.error('SessionService: Error loading session details:', error);
            throw error;
        }
    }

    private showErrorState(): void {
        if (this.dataSelect) {
            this.dataSelect.innerHTML = '<option selected disabled>Ошибка загрузки</option>';
        }
    }

    public getCurrentSession(): Session | null {
        return this.sessions.find(s => s.id === this.currentSessionId) || null;
    }

    public getSessions(): Session[] {
        return [...this.sessions];
    }

    public async refresh(): Promise<void> {
        await this.loadSessions();
    }

    public destroy(): void {
        // Отписываемся от событий
        eventBus.off(EventTypes.SESSION.UPDATED, this.loadSessions);
        
        if (this.dataSelect) {
            this.dataSelect.removeEventListener('change', this.handleSessionChange);
        }
    }
}