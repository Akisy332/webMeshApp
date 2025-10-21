const API_BASE = 'http://localhost:8003';

let currentToken = localStorage.getItem('auth_token');
let currentUser = null;

// Инициализация
document.addEventListener('DOMContentLoaded', function () {
    updateAuthState();
    loadLogs();

    // Проверка соединения
    checkHealth();
});

// Проверка здоровья сервиса
async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const result = await response.json();
        showResult('healthResult', result, true);
    } catch (error) {
        showResult('healthResult', { error: error.message }, false);
    }
}

// Регистрация
async function register() {
    const email = document.getElementById('regEmail').value;
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;

    if (!email || !username || !password) {
        alert('Please fill all fields');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                username: username,
                password: password
            })
        });

        const result = await response.json();

        if (response.ok) {
            showResult('registerResult', result, true);
            document.getElementById('registerForm').reset();
        } else {
            showResult('registerResult', result, false);
        }
    } catch (error) {
        showResult('registerResult', { error: error.message }, false);
    }
}

// Логин
async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        alert('Please fill all fields');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const result = await response.json();

        if (response.ok) {
            currentToken = result.access_token;
            currentUser = result.user;
            localStorage.setItem('auth_token', currentToken);
            showResult('loginResult', result, true);
            updateAuthState();
            loadLogs();
        } else {
            showResult('loginResult', result, false);
        }
    } catch (error) {
        showResult('loginResult', { error: error.message }, false);
    }
}

// Выход
function logout() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    updateAuthState();
    showResult('userInfoResult', { message: 'Logged out successfully' }, true);
}

// Получение информации о пользователе
async function getCurrentUser() {
    if (!currentToken) {
        alert('Please login first');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/me`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            showResult('userInfoResult', result, true);
        } else {
            showResult('userInfoResult', result, false);
        }
    } catch (error) {
        showResult('userInfoResult', { error: error.message }, false);
    }
}

// Проверка токена
async function verifyToken() {
    if (!currentToken) {
        alert('Please login first');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/verify-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: currentToken
            })
        });

        const result = await response.json();
        showResult('verifyResult', result, response.ok);
    } catch (error) {
        showResult('verifyResult', { error: error.message }, false);
    }
}

// Смена пароля
async function changePassword() {
    if (!currentToken) {
        alert('Please login first');
        return;
    }

    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    if (!oldPassword || !newPassword) {
        alert('Please fill all fields');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                old_password: oldPassword,
                new_password: newPassword
            })
        });

        const result = await response.json();

        if (response.ok) {
            showResult('passwordResult', result, true);
            document.getElementById('passwordForm').reset();
        } else {
            showResult('passwordResult', result, false);
        }
    } catch (error) {
        showResult('passwordResult', { error: error.message }, false);
    }
}

// Получение списка пользователей (только для superuser)
async function getUsersList() {
    if (!currentToken) {
        alert('Please login first');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            showResult('usersListResult', result, true);
        } else {
            showResult('usersListResult', result, false);
        }
    } catch (error) {
        showResult('usersListResult', { error: error.message }, false);
    }
}

// Показать результат
function showResult(elementId, data, isSuccess) {
    const element = document.getElementById(elementId);
    element.textContent = JSON.stringify(data, null, 2);
    element.className = `result ${isSuccess ? 'success' : 'error'}`;
}

// Загрузка логов
async function loadLogs() {
    try {
        const response = await fetch(`${API_BASE}/logs`);
        if (response.ok) {
            const logs = await response.text();
            document.getElementById('logsContent').textContent = logs;
        }
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

// Переключение табов
function switchTab(tabName) {
    // Скрыть все табы
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Убрать активный класс со всех кнопок табов
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Показать выбранный таб
    document.getElementById(tabName).classList.add('active');

    // Активировать кнопку таба
    event.target.classList.add('active');
}

// Автозаполнение тестовыми данными
function fillTestData() {
    document.getElementById('regEmail').value = `test${Date.now()}@example.com`;
    document.getElementById('regUsername').value = `testuser${Date.now()}`;
    document.getElementById('regPassword').value = 'Test123!';

    document.getElementById('loginUsername').value = 'testuser';
    document.getElementById('loginPassword').value = 'Test123!';
}

// Назначение администратором
async function makeAdmin() {
    if (!currentToken) {
        alert('Please login first');
        return;
    }

    const userId = document.getElementById('adminUserId').value;
    if (!userId) {
        alert('Please enter user ID');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${userId}/make-admin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            showResult('adminResult', result, true);
        } else {
            showResult('adminResult', result, false);
        }
    } catch (error) {
        showResult('adminResult', { error: error.message }, false);
    }
}

// Удаление прав администратора
async function removeAdmin() {
    if (!currentToken) {
        alert('Please login first');
        return;
    }

    const userId = document.getElementById('adminUserId').value;
    if (!userId) {
        alert('Please enter user ID');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${userId}/remove-admin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            showResult('adminResult', result, true);
        } else {
            showResult('adminResult', result, false);
        }
    } catch (error) {
        showResult('adminResult', { error: error.message }, false);
    }
}

// Обнови функцию updateAuthState чтобы показывать админ-секцию только админам
function updateAuthState() {
    const authElements = document.querySelectorAll('.auth-required');
    const noAuthElements = document.querySelectorAll('.no-auth');
    const adminElements = document.querySelectorAll('.admin-required');

    if (currentToken) {
        authElements.forEach(el => el.classList.remove('hidden'));
        noAuthElements.forEach(el => el.classList.add('hidden'));

        // Показываем админ-секцию только если пользователь - администратор
        if (currentUser && currentUser.is_superuser) {
            adminElements.forEach(el => el.classList.remove('hidden'));
        } else {
            adminElements.forEach(el => el.classList.add('hidden'));
        }

        if (currentUser) {
            document.getElementById('currentUserInfo').textContent =
                `Logged in as: ${currentUser.username} (${currentUser.email}) ${currentUser.is_superuser ? '👑' : ''}`;
        }
    } else {
        authElements.forEach(el => el.classList.add('hidden'));
        noAuthElements.forEach(el => el.classList.remove('hidden'));
        adminElements.forEach(el => el.classList.add('hidden'));
        document.getElementById('currentUserInfo').textContent = 'Not logged in';
    }
}