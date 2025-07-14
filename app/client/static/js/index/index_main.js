"use strict";

// Обработка кнопки базы данных
let essenceCartBtn = document.querySelector("#db-button");

const mapManager = new MapManager('map');
const tableManager = new TableManager('table-body');


function windowIndexReadyFunc() {


    // Загрузка данных
    fetch('/initTableMap')
        .then(response => response.json())
        .then(data => {
            console.log(data.table)
            mapManager.setPosition(data.map)

            tableManager.updateTable(data.table)
            data.table.forEach(item => {
                mapManager.addOrUpdateMarker(item)
            });

            // Связываем только после загрузки данных
            new MapTableConnector(mapManager, tableManager);
        });

    essenceCartBtn.addEventListener("click", function () {
        window.location.href = "/database";
    });

    initSessionList()
}

// Обработчик кнопки - отправляем запрос на сервер
document.getElementById('random-marker').addEventListener('click', function () {
    eventBus.emit(EventTypes.APP.RANDOM_POINT);
});

document.getElementById('add-data').addEventListener('click', function () {
    // Сбросить форму, если нужно
    document.getElementById('sessionForm').reset();

    // Показать модальное окно
    var modal = new bootstrap.Modal(document.getElementById('sessionModal'));
    modal.show();
});

document.addEventListener('DOMContentLoaded', function () {
    // Обработчик кнопки "+" для открытия модального окна
    document.getElementById('add-data').addEventListener('click', function () {
        // Загружаем список сессий
        loadSessions();

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
    document.getElementById('newSessionForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const sessionData = {
            name: document.getElementById('newSessionName').value,
            description: document.getElementById('newSessionDescription').value,
            date: document.getElementById('newSessionDate').value
        };

        // Здесь отправляем данные на сервер
        console.log('Создаем новую сессию:', sessionData);

        // После успешного создания:
        // 1. Обновляем список сессий
        loadSessions();
        // 2. Показываем пустое состояние
        document.getElementById('newSessionForm').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
        // 3. Можно показать уведомление об успехе
        alert('Сессия успешно создана!');
    });

    // Обработчик отмены редактирования сессии
    document.getElementById('cancelEdit').addEventListener('click', function () {
        document.getElementById('editSessionForm').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
    });

    // Обработчик сохранения изменений сессии
    document.getElementById('editSessionForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const sessionData = {
            id: document.getElementById('editSessionId').value,
            name: document.getElementById('editSessionName').value,
            description: document.getElementById('editSessionDescription').value,
            date: document.getElementById('editSessionDate').value
        };

        // Здесь отправляем данные на сервер
        console.log('Сохраняем изменения сессии:', sessionData);

        // После успешного сохранения:
        // 1. Обновляем список сессий
        loadSessions();
        // 2. Можно показать уведомление об успехе
        alert('Изменения сохранены!');
    });

    // Обработчик удаления сессии
    document.getElementById('deleteSession').addEventListener('click', function () {
        if (confirm('Вы уверены, что хотите удалить эту сессию?')) {
            const sessionId = document.getElementById('editSessionId').value;

            // Здесь отправляем запрос на удаление
            console.log('Удаляем сессию с ID:', sessionId);

            // После успешного удаления:
            // 1. Обновляем список сессий
            loadSessions();
            // 2. Показываем пустое состояние
            document.getElementById('editSessionForm').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            // 3. Можно показать уведомление об успехе
            alert('Сессия удалена!');
        }
    });
});

// Функция для загрузки списка сессий
function loadSessions() {
    // Здесь должен быть запрос к серверу для получения списка сессий
    // Это пример с моковыми данными
    const mockSessions = [
        { id: 1, name: 'Исследование района X', description: 'Первая экспедиция', date: '2023-10-15', participants: ['Иванов И.И.', 'Петров П.П.'] },
        { id: 2, name: 'Картографирование', description: 'Уточнение границ', date: '2023-11-02', participants: ['Сидоров С.С.'] },
        { id: 3, name: 'Разведка маршрута', description: 'Поиск оптимального пути', date: '2023-11-20', participants: ['Иванов И.И.', 'Кузнецов К.К.'] }
    ];

    const sessionsList = document.getElementById('sessionsList');
    sessionsList.innerHTML = '';

    mockSessions.forEach(session => {
        const sessionElement = document.createElement('button');
        sessionElement.className = 'list-group-item list-group-item-action';
        sessionElement.innerHTML = `
            <div class="d-flex w-100 justify-content-between">
                <h6 class="mb-1">${session.name}</h6>
                <small>${session.date}</small>
            </div>
            <p class="mb-1 text-muted small">${session.description || 'Нет описания'}</p>
            <small>Участников: ${session.participants.length}</small>
        `;

        sessionElement.addEventListener('click', function () {
            // Заполняем форму редактирования данными сессии
            document.getElementById('editSessionId').value = session.id;
            document.getElementById('editSessionName').value = session.name;
            document.getElementById('editSessionDescription').value = session.description || '';
            document.getElementById('editSessionDate').value = session.date;

            // Заполняем список участников
            const participantsList = document.getElementById('participantsList');
            if (session.participants.length > 0) {
                participantsList.innerHTML = '';
                session.participants.forEach(participant => {
                    const participantElement = document.createElement('div');
                    participantElement.className = 'd-flex justify-content-between align-items-center mb-2';
                    participantElement.innerHTML = `
                        <span>${participant}</span>
                        <button class="btn btn-sm btn-outline-danger">×</button>
                    `;
                    participantsList.appendChild(participantElement);
                });
            } else {
                participantsList.innerHTML = '<div class="text-muted">Нет участников</div>';
            }

            // Показываем форму редактирования
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('newSessionForm').style.display = 'none';
            document.getElementById('editSessionForm').style.display = 'block';
        });

        sessionsList.appendChild(sessionElement);
    });
}



window.onload = windowIndexReadyFunc;