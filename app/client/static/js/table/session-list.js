let sessions = null;
let currentSessionId = null;

function initSessionList() {
    const dataSelect = document.getElementById('data-select');
    const addDataBtn = document.getElementById('add-data');

    console.log("initSessionList");

    // Загрузка списка сессий
    async function loadSessions() {
        try {
            dataSelect.disabled = true;
            dataSelect.innerHTML = '<option selected disabled>Загрузка...</option>';

            const response = await fetch('/api/sessions');
            if (!response.ok) throw new Error('Ошибка загрузки');

            sessions = await response.json();

            if (sessions.length === 0) {
                dataSelect.innerHTML = '<option selected disabled>Нет доступных сессий</option>';
                eventBus.emit(EventTypes.SESSION.LIST_LOADED, { sessions: [], selectedSession: null });
                return;
            }

            // Сортируем сессии по datetime в порядке убывания
            sessions.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

            dataSelect.innerHTML = '';

            // Добавляем placeholder option
            const placeholderOption = new Option('Выберите сессию', '', true, true);
            placeholderOption.disabled = true;
            placeholderOption.hidden = true;
            dataSelect.add(placeholderOption);

            // Добавляем все сессии
            sessions.forEach(session => {
                dataSelect.add(new Option(session.name, session.id));
            });

            // Пытаемся получить сохраненный sessionId из localStorage
            const savedSessionId = localStorage.getItem('selectedSessionId');

            // Ищем сессию для выбора (сначала сохраненную, потом первую в списке)
            let sessionToSelect = null;

            if (savedSessionId) {
                sessionToSelect = sessions.find(s => s.id == savedSessionId);
            }

            if (!sessionToSelect && sessions.length > 0) {
                sessionToSelect = sessions[0]; // Первая сессия как fallback
            }

            if (sessionToSelect) {
                // Устанавливаем значение и сохраняем ID
                dataSelect.value = sessionToSelect.id;
                currentSessionId = sessionToSelect.id;

                // Загружаем данные сессии
                try {
                    const response = await fetch(`/api/sessions/${sessionToSelect.id}/data`);
                    if (!response.ok) throw new Error('Ошибка загрузки данных');

                    const sessionData = await response.json();
                    eventBus.emit(EventTypes.SESSION.LOAD_DATA, sessionData);
                    eventBus.emit(EventTypes.SESSION.SELECTED, sessionToSelect);
                } catch (error) {
                    console.error('Ошибка загрузки данных сессии:', error);
                    eventBus.emit(EventTypes.ERROR, 'Ошибка загрузки данных сессии');
                }
            }

            // Отправляем событие о загрузке списка
            eventBus.emit(EventTypes.SESSION.LIST_LOADED, {
                sessions,
                selectedSession: sessionToSelect || null
            });

        } catch (error) {
            console.error('Ошибка:', error);
            dataSelect.innerHTML = '<option selected disabled>Ошибка загрузки</option>';
            eventBus.emit(EventTypes.ERROR, 'Ошибка загрузки списка сессий');
        } finally {
            dataSelect.disabled = false;
        }
    }

    // Обработчик изменения сессии
    dataSelect.addEventListener('change', async function () {
        const sessionId = this.value;
        if (!sessionId) return;

        currentSessionId = sessionId;
        localStorage.setItem('selectedSessionId', sessionId);

        try {
            const response = await fetch(`/api/sessions/${sessionId}/data`);
            if (!response.ok) throw new Error('Ошибка загрузки данных');

            const sessionData = await response.json();
            eventBus.emit(EventTypes.SESSION.LOAD_DATA, sessionData);

            if (sessions) {
                const selectedSession = sessions.find(s => s.id === sessionId);
                if (selectedSession) {
                    eventBus.emit(EventTypes.SESSION.SELECTED, selectedSession);
                }
            }

        } catch (error) {
            console.error('Ошибка:', error);
            eventBus.emit(EventTypes.ERROR, 'Ошибка загрузки данных сессии');
        }
    });

    // Подписка на событие обновления списка сессий
    eventBus.on(EventTypes.SESSION.UPDATED, () => {
        loadSessions();
    });

    // Инициализация
    loadSessions();
};