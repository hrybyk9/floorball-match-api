// common.js — спільні змінні та допоміжні функції, якими користуються всі інші скрипти.

// Спільні дані 

// Список команд, щоб у таблицях і картках показувати НАЗВУ команди, а не її id
let teamsList = [];

// Турнірна таблиця обраного турніру (заповнює loadStandings у matches.js).
// Потрібна ще й карткам команд: "1 місце · 13 очок"
let standingsList = [];

// Скільки гравців у кожній команді: { 11: 6, 12: 0, ... } (заповнює players.js)
let playerCounts = {};


// Повідомлення 

// Показує повідомлення під формою (червоне — помилка, звичайне — успіх).
function showMessage(elementId, text, isError) {
    const box = document.getElementById(elementId);
    box.textContent = text;
    box.classList.remove('error', 'success');
    box.classList.add(isError ? 'error' : 'success');
}

// Показує помилку двічі:
//  1) спливаючим вікном alert() — щоб користувач точно її помітив;
//  2) червоним текстом під формою — щоб вона лишилась видимою після закриття вікна.
function showError(elementId, text) {
    showMessage(elementId, 'Помилка: ' + text, true);
    alert('Помилка: ' + text);
}


// Створення елементів сторінки 

// Створює будь-який елемент з класом і текстом.
function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

// Створює клітинку таблиці <td> з текстом 
function createCell(text, className) {
    return createElement('td', className, text);
}

// Створює кнопку з текстом, CSS-класом і функцією, що виконається при кліку
function createButton(text, className, onClick) {
    const button = createElement('button', className, text);
    button.type = 'button';          // щоб кнопка не відправляла жодну форму
    button.addEventListener('click', onClick);
    return button;
}

// Іконки для кнопок (inline SVG). Це НАШ сталий текст, а не дані з сервера,
// тому вставляти його через innerHTML безпечно.
// aria-hidden="true" — програма читання з екрана не читає малюнок, вона прочитає aria-label кнопки
const ICONS = {
    edit: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">'
        + '<path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    delete: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">'
        + '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

// Маленька квадратна кнопка-іконка 
// kind — 'edit' або 'delete'; label — підпис для aria-label і підказки title
function createIconButton(kind, label, onClick) {
    const button = createButton('', 'icon-button icon-' + kind, onClick);
    button.innerHTML = ICONS[kind];
    button.setAttribute('aria-label', label); // для програм читання з екрана
    button.title = label;                     // підказка при наведенні мишки
    return button;
}

// Створює поле введення <input> з початковим значенням
function createInput(type, value) {
    const input = document.createElement('input');
    input.type = type;               // 'text', 'number', 'date', 'datetime-local'...
    input.value = value;             // поточне значення з бази
    return input;
}

// Створює випадаючий список <select>.
// options — масив пар [значення, текст], selectedValue — що обрати одразу
function createSelect(options, selectedValue) {
    const select = document.createElement('select');
    for (const [value, text] of options) {
        select.appendChild(new Option(text, value));
    }
    // String() — бо value у <select> завжди рядок, а id з сервера — число
    select.value = String(selectedValue);
    return select;
}

// Поле з підписом зверху
// Використовується в режимах редагування (команда, матч, турнір)
function createField(labelText, inputElement) {
    const label = createElement('label', 'field');
    label.appendChild(createElement('span', 'field-label', labelText));
    label.appendChild(inputElement);
    return label;
}

// Створює рядок-підказку на всю ширину таблиці, наприклад "Оберіть турнір".
// colSpan — скільки колонок "об'єднати" в одну клітинку
function createEmptyRow(text, colSpan) {
    const row = createElement('tr', 'empty-row'); // сірий текст по центру (style.css)
    const td = createCell(text);
    td.colSpan = colSpan;
    row.appendChild(td);
    return row;
}

// Обгортає елементи (input/select/кнопки) у клітинку <td>
function wrapInCell(...elements) {
    const td = document.createElement('td');
    td.append(...elements);          // ...elements — можна передати кілька елементів
    return td;
}


// Робота з командами

// Повертає список команд у форматі для createSelect
function getTeamOptions() {
    return teamsList.map(team => [team.id, team.name]);
}

// Повертає назву команди за її id (шукаємо у вже завантаженому списку)
function getTeamName(teamId) {
    const team = teamsList.find(t => t.id === teamId);
    return team ? team.name : '—';
}

// Повертає місто команди за її id
function getTeamCity(teamId) {
    const team = teamsList.find(t => t.id === teamId);
    return team ? team.city : '';
}


// Форматування тексту

// "2026-09-01" -> "01.09.2026" (дата з сервера приходить у форматі РРРР-ММ-ДД)
function formatDate(isoDate) {
    const [year, month, day] = isoDate.slice(0, 10).split('-'); // розбиваємо рядок по дефісу
    return day + '.' + month + '.' + year;
}

// Різниця голів зі знаком: 17 -> "+17", -2 -> "−2"
function formatGoalDifference(value) {
    if (value > 0) {
        return '+' + value;
    }
    if (value < 0) {
        return '−' + Math.abs(value);
    }
    return '0';
}

// Українські форми слова після числа:
function pluralize(count, one, few, many) {
    const lastTwo = count % 100;   // дві останні цифри (11–14 — завжди "many")
    const last = count % 10;       // остання цифра
    let word = many;
    if (lastTwo < 11 || lastTwo > 14) {
        if (last === 1) {
            word = one;
        } else if (last >= 2 && last <= 4) {
            word = few;
        }
    }
    return count + ' ' + word;
}


// Запити до сервера
const TOKEN_STORAGE_KEY = 'adminToken';

function getToken() {
    try {
        return sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch (error) {
        return null;
    }
}


function authHeaders() {
    const token = getToken();
    if (token) {
        return { Authorization: 'Bearer ' + token };
    }
    return {};
}

// Відправляє PATCH-запит із JSON-даними (однаково для команд, гравців, матчів і турнірів)
async function sendPatch(url, data) {
    return fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }, 
        body: JSON.stringify(data),
    });
}

// Дістає текст помилки з відповіді сервера.
// FastAPI повертає помилку в полі detail:
//   рядок, якщо помилку кинули ми самі (HTTPException, наприклад 404);
//   масив, якщо не пройшла валідація Pydantic (код 422).
async function getErrorText(response) {
    if (response.status === 401) {
        saveToken(null);
        setAdminMode(false);
    }

    const error = await response.json();
    if (typeof error.detail === 'string') {
        return error.detail;
    }
    if (Array.isArray(error.detail) && error.detail.length > 0) {
        // Перше повідомлення валідації. Pydantic додає на початок англійське "Value error, "
        // до наших текстів з валідаторів — прибираємо його
        return error.detail[0].msg.replace('Value error, ', '');
    }
    return 'Перевірте правильність введених даних';
}