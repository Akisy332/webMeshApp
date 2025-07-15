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
                // Отправляем пустой список через eventBus
                eventBus.emit(EventTypes.SESSION.LIST_LOADED, { sessions: [], selectedSession: null });
                return;
            }

            // Сортируем сессии по datetime в порядке убывания (самые новые сначала)
            sessions.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

            dataSelect.innerHTML = '<option selected disabled>Выберите сессию</option>';
            sessions.forEach(session => {
                dataSelect.add(new Option(session.name, session.id));
            });

            // Автоматически выбираем самую новую сессию (первую в отсортированном массиве)
            if (sessions.length > 0) {
                const newestSessionId = sessions[0].id;
                dataSelect.value = newestSessionId;
                currentSessionId = newestSessionId;

                // Имитируем событие change для загрузки данных новой сессии
                const event = new Event('change');
                dataSelect.dispatchEvent(event);

                // Отправляем данные через eventBus
                eventBus.emit(EventTypes.SESSION.LIST_LOADED, {
                    sessions,
                    selectedSession: sessions.find(s => s.id === newestSessionId)
                });
            }

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

        try {
            const response = await fetch(`/api/sessions/${sessionId}/data`);
            if (!response.ok) throw new Error('Ошибка загрузки данных');

            const sessionData = await response.json();

            // Отправляем данные через eventBus
            eventBus.emit(EventTypes.SESSION.LOAD_DATA, sessionData);

            // Также отправляем информацию о выбранной сессии
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