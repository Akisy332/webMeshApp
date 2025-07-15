function initModalWindow() {
    let allSessions = [];
    let currentSession = null;

    // Подписка на события EventBus
    eventBus.on(EventTypes.SESSION.LIST_LOADED, ({ sessions, selectedSession }) => {
        allSessions = sessions || [];
        currentSession = selectedSession;
        updateSessionsListUI();
    });

    eventBus.on(EventTypes.SESSION.SELECTED, (session) => {
        currentSession = session;
    });

    eventBus.on(EventTypes.SESSION.UPDATED, () => {
        // При обновлении списка сессий просто обновляем UI
        updateSessionsListUI();
    });

    // Функция для обновления UI списка сессий
    function updateSessionsListUI() {
        const sessionsList = document.getElementById('sessionsList');
        sessionsList.innerHTML = '';

        if (allSessions.length === 0) {
            sessionsList.innerHTML = '<div class="text-muted p-3">Нет доступных сессий</div>';
            return;
        }

        // Сортируем сессии по дате (новые сначала)
        const sortedSessions = [...allSessions].sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedSessions.forEach(session => {
            const sessionElement = document.createElement('button');
            sessionElement.className = 'list-group-item list-group-item-action';
            if (currentSession && session.id === currentSession.id) {
                sessionElement.classList.add('active');
            }

            sessionElement.innerHTML = `
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1">${session.name}</h6>
                    <small>${session.date}</small>
                </div>
                <p class="mb-1 text-muted small">${session.description || 'Нет описания'}</p>
            `;

            sessionElement.addEventListener('click', function () {
                // Заполняем форму редактирования данными сессии
                document.getElementById('editSessionId').value = session.id;
                document.getElementById('editSessionName').value = session.name;
                document.getElementById('editSessionDescription').value = session.description || '';
                document.getElementById('editSessionDate').value = session.date;

                // Показываем форму редактирования
                document.getElementById('emptyState').style.display = 'none';
                document.getElementById('newSessionForm').style.display = 'none';
                document.getElementById('editSessionForm').style.display = 'block';
            });

            sessionsList.appendChild(sessionElement);
        });
    }

    // Обработчик кнопки "+" для открытия модального окна
    document.getElementById('add-data').addEventListener('click', function () {
        // Показываем модальное окно
        const modal = new bootstrap.Modal(document.getElementById('sessionModal'));
        modal.show();

        // Устанавливаем текущую дату по умолчанию для новой сессии
        document.getElementById('newSessionDate').valueAsDate = new Date();
    });

    // Обработчик кнопки "Новая сессия"
    document.getElementById('createNewSession').addEventListener('click', function () {
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('editSessionForm').style.display = 'none';
        document.getElementById('newSessionForm').style.display = 'block';

        // Сбрасываем форму
        document.getElementById('newSessionForm').reset();
        document.getElementById('newSessionDate').valueAsDate = new Date();
    });

    // Обработчик отмены создания новой сессии
    document.getElementById('cancelCreate').addEventListener('click', function () {
        document.getElementById('newSessionForm').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
    });

    // Обработчик сохранения новой сессии
    document.getElementById('newSessionForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        const sessionData = {
            name: document.getElementById('newSessionName').value,
            description: document.getElementById('newSessionDescription').value,
            date: document.getElementById('newSessionDate').value
        };

        try {
            const response = await fetch('/api/sessions', {
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
            document.getElementById('newSessionForm').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';

            // Можно показать уведомление об успехе
            alert('Сессия успешно создана!');

        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка при создании сессии');
        }
    });

    // Обработчик отмены редактирования сессии
    document.getElementById('cancelEdit').addEventListener('click', function () {
        document.getElementById('editSessionForm').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
    });

    // Обработчик сохранения изменений сессии
    document.getElementById('editSessionForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        const sessionData = {
            id: document.getElementById('editSessionId').value,
            name: document.getElementById('editSessionName').value,
            description: document.getElementById('editSessionDescription').value,
            date: document.getElementById('editSessionDate').value
        };

        try {
            const response = await fetch(`/api/sessions/${sessionData.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(sessionData)
            });

            if (!response.ok) throw new Error('Ошибка сохранения изменений');

            // Уведомляем систему об обновлении списка сессий
            eventBus.emit(EventTypes.SESSION.UPDATED);

            // Можно показать уведомление об успехе
            alert('Изменения сохранены!');

        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка при сохранении изменений');
        }
    });

    // Обработчик удаления сессии
    document.getElementById('deleteSession').addEventListener('click', async function () {
        if (confirm('Вы уверены, что хотите удалить эту сессию?')) {
            const sessionId = document.getElementById('editSessionId').value;

            try {
                const response = await fetch(`/api/sessions/${sessionId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) throw new Error('Ошибка удаления сессии');

                // Уведомляем систему об обновлении списка сессий
                eventBus.emit(EventTypes.SESSION.UPDATED);

                // Закрываем форму редактирования
                document.getElementById('editSessionForm').style.display = 'none';
                document.getElementById('emptyState').style.display = 'block';

                // Можно показать уведомление об успехе
                alert('Сессия удалена!');

            } catch (error) {
                console.error('Ошибка:', error);
                alert('Ошибка при удалении сессии');
            }
        }
    });
};