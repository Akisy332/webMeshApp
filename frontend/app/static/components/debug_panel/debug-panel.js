document.addEventListener('DOMContentLoaded', function () {
    const debugPanelContainer = document.getElementById('debug-panel-container');
    const debugToggleBtn = document.getElementById('debug-toggle-btn');
    const debugLogs = document.getElementById('debug-logs');
    const debugClearBtn = document.getElementById('debug-clear-btn');
    const debugTestBtn = document.getElementById('debug-test-btn');

    // Переключение видимости панели
    debugToggleBtn.addEventListener('click', function () {
        debugPanelContainer.classList.toggle('debug-panel-hidden');
        updateToggleButtonPosition();
        updateToggleButtonText();
        savePanelState();
    });

    // Функция для обновления позиции кнопки
    function updateToggleButtonPosition() {
        requestAnimationFrame(() => {
            const isHidden = debugPanelContainer.classList.contains('debug-panel-hidden');

            if (isHidden) {
                debugToggleBtn.style.left = '10px';
                debugToggleBtn.style.top = '50%'; // Центр по вертикали
                debugToggleBtn.style.transform = 'translateY(-50%)'; // Точное центрирование
            } else {
                debugToggleBtn.style.left = '310px'; // 300px + 10px
                debugToggleBtn.style.top = '50%'; // Центр по вертикали
                debugToggleBtn.style.transform = 'translateY(-50%)'; // Точное центрирование
            }
        });
    }

    // Также нужно обновлять позицию при ресайзе и скролле
    window.addEventListener('resize', updateToggleButtonPosition);
    window.addEventListener('scroll', updateToggleButtonPosition);

    // И вызвать после анимации переключения
    setTimeout(updateToggleButtonPosition, 300);


    // Обновление текста кнопки переключения
    function updateToggleButtonText() {
        const isHidden = debugPanelContainer.classList.contains('debug-panel-hidden');
        debugToggleBtn.textContent = isHidden ? '▶' : '◀';
        debugToggleBtn.title = isHidden ? 'Показать панель' : 'Скрыть панель';
    }

    // Сохранение состояния панели
    function savePanelState() {
        const isHidden = debugPanelContainer.classList.contains('debug-panel-hidden');
        localStorage.setItem('debugPanelHidden', isHidden);
    }

    // Загрузка состояния панели
    function loadPanelState() {
        const savedState = localStorage.getItem('debugPanelHidden');
        if (savedState === 'true') {
            debugPanelContainer.classList.add('debug-panel-hidden');
        }
        updateToggleButtonPosition();
        updateToggleButtonText();
    }

    // Инициализация
    loadPanelState();

    // Очистка логов
    debugClearBtn.addEventListener('click', function () {
        debugLogs.innerHTML = '';
        addLog('Логи очищены');
    });

    // Тестовая кнопка
    debugTestBtn.addEventListener('click', function () {
        addLog('Тестовая кнопка нажата');
    });

    // Функция для добавления записей в лог
    function addLog(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${timestamp}] ${message}`;
        debugLogs.appendChild(logEntry);
        debugLogs.scrollTop = debugLogs.scrollHeight;
    }

    addLog('Панель отладки инициализирована');

    // Обработка ошибок
    window.addEventListener('error', function (e) {
        addLog(`Ошибка: ${e.message}`);
    });
});