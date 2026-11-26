// auth.js — розмежування прав: "Відвідувач" і "Адміністратор".

// Елементи модального вікна входу
const loginDialog = document.getElementById('login-dialog');
const loginForm = document.getElementById('login-form');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');

function saveToken(token) {
    try {
        if (token) {
            sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
        } else {
            sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        }
    } catch (error) {
        console.warn('sessionStorage недоступне', error);
    }
}

// Режим інтерфейсу
function setAdminMode(isAdmin) {
    document.body.classList.toggle('organizer-mode', isAdmin);
    document.getElementById('role-badge').textContent = isAdmin ? 'адміністратор' : 'Ви — відвідувач';
}

// Вікно входу 
function openLoginDialog() {
    loginForm.reset();            
    loginError.textContent = '';  
    loginDialog.showModal();
    loginUsernameInput.focus();   // курсор одразу в полі логіна
}

function closeLoginDialog() {
    loginDialog.close();
}

// Кнопка "Увійти" у шапці -> відкриваємо вікно
document.getElementById('login-button').addEventListener('click', openLoginDialog);

// Хрестик і "Скасувати" у вікні -> просто закриваємо
document.getElementById('login-close').addEventListener('click', closeLoginDialog);
document.getElementById('login-cancel').addEventListener('click', closeLoginDialog);

// Відправка форми у вікні (кнопка "Увійти" або Enter)
loginForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // сторінка не перезавантажується

    // Надсилаємо логін і пароль на сервер
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: loginUsernameInput.value.trim(),
            password: loginPasswordInput.value,
        }),
    });

    if (response.ok) {
        // Успіх: сервер повернув { "token": "...", "role": "admin" }
        const data = await response.json();
        saveToken(data.token);
        setAdminMode(true);
        closeLoginDialog();
    } else {
        // 401 — логін або пароль неправильні: вікно лишається відкритим
        loginError.textContent = 'Невірний логін або пароль. Спробуйте ще раз.';
        loginPasswordInput.select(); // виділяємо пароль, щоб одразу набрати заново
    }
});

// Кнопка "Вийти"
document.getElementById('logout-button').addEventListener('click', async () => {
    // Повідомляємо сервер, щоб він "забув" токен
    await fetch('/api/auth/logout', {
        method: 'POST',
        headers: authHeaders(),
    });
    saveToken(null);
    setAdminMode(false);
});

// Відновлення ролі при завантаженні сторінки
// Якщо в цій вкладці вже входили, питаємо сервер, чи токен ще дійсний.
// Токен може застаріти, наприклад, якщо сервер перезапустили
async function restoreRole() {
    setAdminMode(false); // поки не дізнались відповідь — показуємо як відвідувачу

    if (!getToken()) {
        return; // токена немає — це відвідувач
    }

    const response = await fetch('/api/auth/me', { headers: authHeaders() });
    const data = await response.json(); // { "role": "admin" } або { "role": "visitor" }

    if (data.role === 'admin') {
        setAdminMode(true);
    } else {
        saveToken(null); // токен застарів — видаляємо його
    }
}

// .catch — якщо сервер недоступний, помилка піде в консоль, а ми лишимось відвідувачем
restoreRole().catch(console.error);