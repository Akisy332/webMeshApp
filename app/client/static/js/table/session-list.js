function initSessionList() {

    const dataSelect = document.getElementById('data-select');
    const addDataBtn = document.getElementById('add-data');
    let currentSessionId = null;

    console.log("initSessionList")
    // Загрузка списка сессий
    async function loadSessions() {
        try {
            dataSelect.disabled = true;
            dataSelect.innerHTML = '<option selected disabled>Загрузка...</option>';
            
            const response = await fetch('/api/sessions');
            if (!response.ok) throw new Error('Ошибка загрузки');
            
            const sessions = await response.json();
            
            dataSelect.innerHTML = '<option selected disabled>Выберите сессию</option>';
            sessions.forEach(session => {
                dataSelect.add(new Option(session.name, session.id));
            });
            
            if (currentSessionId) {
                dataSelect.value = currentSessionId;
            }
            
        } catch (error) {
            console.error('Ошибка:', error);
            dataSelect.innerHTML = '<option selected disabled>Ошибка загрузки</option>';
        } finally {
            dataSelect.disabled = false;
        }
    }

    // Обработчик изменения сессии
    dataSelect.addEventListener('change', async function() {
        const sessionId = this.value;
        if (!sessionId) return;
        
        currentSessionId = sessionId;
        
        try {
            const response = await fetch(`/api/sessions/${sessionId}/data`);
            if (!response.ok) throw new Error('Ошибка загрузки данных');
            
            const sessionData = await response.json();
            
            // Отправляем данные через eventBus
            eventBus.emit(EventTypes.SESSION.LOAD, sessionData);
            
        } catch (error) {
            console.error('Ошибка:', error);
            eventBus.emit(EventTypes.ERROR, 'Ошибка загрузки данных сессии');
        }
    });

    // // Обработчик кнопки добавления
    // addDataBtn.addEventListener('click', async () => {
    //     const name = prompt('Введите название сессии:');
    //     if (!name) return;
        
    //     try {
    //         const response = await fetch('/api/sessions', {
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ name })
    //         });
            
    //         if (!response.ok) throw new Error('Ошибка создания');
            
    //         // Обновляем список и выбираем новую сессию
    //         const newSession = await response.json();
    //         await loadSessions();
    //         dataSelect.value = newSession.id;
    //         dataSelect.dispatchEvent(new Event('change'));
            
    //     } catch (error) {
    //         console.error('Ошибка:', error);
    //         eventBus.emit(EventTypes.TABLE.ERROR, 'Не удалось создать сессию');
    //     }
    // });

    // Инициализация
    loadSessions();
};