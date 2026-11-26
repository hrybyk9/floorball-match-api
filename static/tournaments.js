// tournaments.js — турніри / змагання 

// Список турнірів, отриманий із сервера (GET /api/tournaments/)
let tournamentsList = [];

// id обраного (активного) турніру як рядок ('' — якщо турнірів немає).
// Раніше його зберігав <select> у шапці, тепер — ця змінна
let activeTournamentId = '';

// Кількість команд і матчів у кожному турнірі (для карток):
// { 3: { teams: 6, matches: 15 }, 4: { teams: 4, matches: 6 } }
let tournamentStats = {};

// Ключ, під яким запам'ятовуємо обраний турнір у sessionStorage
const TOURNAMENT_STORAGE_KEY = 'activeTournamentId';

// Статуси турніру українською (для смуги зверху картки)
const TOURNAMENT_STATUS_NAMES = {
    running: 'Триває',
    scheduled: 'Заплановано',
    finished: 'Завершено',
};


// Дати і статус турніру
function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // місяці рахуються з 0
    const day = String(now.getDate()).padStart(2, '0');        // "7" -> "07"
    return year + '-' + month + '-' + day;
}

// Статус турніру за датами: 'running' (триває), 'scheduled' (заплановано), 'finished' (завершено)
function getTournamentStatus(tournament) {
    const today = getTodayString();
    if (today < tournament.startDate) {
        return 'scheduled';
    }
    if (today > tournament.endDate) {
        return 'finished';
    }
    return 'running'; // startDate <= сьогодні <= endDate
}

// Турніри, що тривають сьогодні, у порядку з правила:
// спочатку той, що почався пізніше (startDate за спаданням), при рівності — менший id
function getRunningTournaments() {
    const running = tournamentsList.filter(t => getTournamentStatus(t) === 'running');
    // localeCompare порівнює рядки: від'ємне число — a раніше, додатне — пізніше.
    // || — якщо дати однакові (результат 0), порівнюємо id
    running.sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id - b.id);
    return running;
}

// Коротка назва для кнопки перемикача: "ЧУ 26/27 | Жінки" -> "Жінки",
// а "Кубок України 2026" (без " | ") лишається повною назвою
function getShortTournamentName(tournament) {
    return tournament.name.split(' | ')[1] || tournament.name;
}


// Обраний турнір

// Повертає id обраного турніру як РЯДОК ('' — якщо турнірів немає).
// Цю функцію використовує matches.js, щоб знати, які матчі завантажувати
function getActiveTournamentId() {
    return activeTournamentId;
}

// Повертає об'єкт обраного турніру (або null)
function getActiveTournament() {
    const id = Number(activeTournamentId);
    return tournamentsList.find(t => t.id === id) || null;
}

// Запам'ятовуємо вибір користувача (try/catch — сховище може бути заблоковане)
function saveActiveTournament() {
    try {
        sessionStorage.setItem(TOURNAMENT_STORAGE_KEY, activeTournamentId);
    } catch (error) {
        console.warn('sessionStorage недоступне', error);
    }
}

// Читаємо збережений вибір ('' — якщо нічого не збережено)
function readSavedTournament() {
    try {
        return sessionStorage.getItem(TOURNAMENT_STORAGE_KEY) || '';
    } catch (error) {
        return '';
    }
}

// Забуваємо збережений вибір (наприклад, коли цей турнір видалили)
function forgetSavedTournament() {
    try {
        sessionStorage.removeItem(TOURNAMENT_STORAGE_KEY);
    } catch (error) {
        // не страшно — просто нічого не було збережено
    }
}

// ПРАВИЛО ВИБОРУ ТУРНІРУ НА СТАРТОВОМУ ЕКРАНІ
// Повертає id турніру рядком або '' (турнірів немає)
function chooseStartTournament() {
    const today = getTodayString();

    // 1. Вибір користувача: id у sessionStorage і такий турнір є у списку
    const savedId = readSavedTournament();
    if (tournamentsList.some(t => String(t.id) === savedId)) {
        return savedId;
    }

    // 2. Турніри, що тривають сьогодні — беремо перший після сортування
    const running = getRunningTournaments();
    if (running.length > 0) {
        return String(running[0].id);
    }

    // 3. Жоден не триває — найближчий запланований (найменший startDate у майбутньому)
    const planned = tournamentsList.filter(t => t.startDate > today);
    planned.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
    if (planned.length > 0) {
        return String(planned[0].id);
    }

    // 4. Запланованих немає — останній завершений (найбільший endDate)
    const finished = tournamentsList.filter(t => t.endDate < today);
    finished.sort((a, b) => b.endDate.localeCompare(a.endDate) || a.id - b.id);
    if (finished.length > 0) {
        return String(finished[0].id);
    }

    // 5. Турнірів немає взагалі (main.js тоді відкриє сторінку "Турніри")
    return '';
}


// Завантаження

// Рахує кількість команд-учасниць і матчів зі списку матчів турніру.
// Учасники — ті самі, що й у турнірній таблиці: усі, хто є в матчах турніру
function countTournamentStats(matches) {
    const teamIds = new Set(); // Set — кожен id потрапить лише один раз
    for (const match of matches) {
        teamIds.add(match.homeTeamId);
        teamIds.add(match.awayTeamId);
    }
    return { teams: teamIds.size, matches: matches.length };
}

// Для кожного турніру просимо його матчі (той самий запит, що й у loadMatches)
// і рахуємо цифри для карток. Окремого ендпоінту для статистики не потрібно
async function loadTournamentStats() {
    tournamentStats = {};
    for (const tournament of tournamentsList) {
        const response = await fetch('/api/matches/?tournament_id=' + tournament.id);
        if (response.ok) {
            const matches = await response.json();
            tournamentStats[tournament.id] = countTournamentStats(matches);
        }
        // якщо запит не вдався — на картці буде "…" замість цифр
    }
}

// Завантажує турніри і вирішує, який з них обраний.
// selectId — id турніру, який треба обрати (наприклад, щойно створений); можна не передавати
async function loadTournaments(selectId) {
    const response = await fetch('/api/tournaments/');
    if (!response.ok) {
        throw new Error('Не вдалося завантажити турніри: код ' + response.status);
    }
    tournamentsList = await response.json();

    if (selectId) {
        // Явний вибір (щойно створений турнір) — це теж вибір користувача, зберігаємо
        activeTournamentId = String(selectId);
        saveActiveTournament();
    } else if (!tournamentsList.some(t => String(t.id) === activeTournamentId)) {
        // Обраного ще немає (перше відкриття) або його видалили — діємо за правилом
        activeTournamentId = chooseStartTournament();
    }
    // інакше — лишаємо турнір, який уже обраний

    await loadTournamentStats();
    renderTournamentInfo();
}

// Перемальовує все, що залежить від списку турнірів і обраного турніру
function renderTournamentInfo() {
    updateTournamentHeader();
    renderRunningSwitcher();
    renderTournamentCards();
}

// Перезавантажує все, що залежить від турніру: матчі (разом із "Результатами"
// і "Наступною грою") та турнірну таблицю (разом із картками команд)
async function reloadTournamentData() {
    await loadMatches();
    await loadStandings();
}

// Користувач обрав турнір (кнопка перемикача або "Обрати" на картці)
async function selectTournament(tournamentId) {
    activeTournamentId = String(tournamentId);
    saveActiveTournament();   // за правилом: вибір зберігаємо в sessionStorage
    renderTournamentInfo();   // назва в шапці, активна кнопка, тінь на картці
    await reloadTournamentData();
}


// Шапка: "Турнір: … · дати" 

// Оновлює все, що на сторінці залежить від обраного турніру (крім таблиць):
//  - назву і дати турніру в шапці;
//  - назву турніру у формі "Новий матч";
//  - межі (min/max) для поля дати матчу.
function updateTournamentHeader() {
    const tournament = getActiveTournament();
    const nameSpan = document.getElementById('active-tournament-name');
    const datesSpan = document.getElementById('tournament-dates');
    const formName = document.getElementById('match-tournament-name');
    const matchDateInput = document.getElementById('match-date');

    if (tournament === null) {
        nameSpan.textContent = 'не обрано';
        datesSpan.textContent = '';
        formName.textContent = 'не обрано';
        matchDateInput.min = '';
        matchDateInput.max = '';
        return;
    }

    nameSpan.textContent = tournament.name;
    datesSpan.textContent = formatDate(tournament.startDate) + ' – ' + formatDate(tournament.endDate);
    formName.textContent = tournament.name;

    // Поле datetime-local приймає формат "2026-09-01T00:00".
    // Браузер не дасть обрати дату поза межами турніру (сервер теж перевіряє)
    matchDateInput.min = tournament.startDate + 'T00:00';
    matchDateInput.max = tournament.endDate + 'T23:59';
}


// Перемикач "Зараз тривають"

// Перемикач між турнірами, що йдуть одночасно. Показується, тільки якщо:
//  1) турнірів, що тривають, БІЛЬШЕ ОДНОГО;
//  2) ОБРАНИЙ турнір — один із них. Якщо обрано завершений або запланований турнір - перемикач ховаємо.
// Кнопки створюються циклом зі списку running — нова категорія з'явиться сама
function renderRunningSwitcher() {
    const switcher = document.getElementById('running-switcher');
    const buttonsBox = document.getElementById('running-buttons');
    const running = getRunningTournaments();

    buttonsBox.innerHTML = '';

    // some() — чи є в списку хоча б один турнір з id обраного
    const activeIsRunning = running.some(t => String(t.id) === activeTournamentId);

    // Ховаємо перемикач, якщо перемикати нема між чим або обраний турнір зараз не триває
    switcher.hidden = running.length <= 1 || !activeIsRunning;
    if (switcher.hidden) {
        return; // кнопки не потрібні — далі не йдемо
    }

    for (const tournament of running) {
        const button = createButton(getShortTournamentName(tournament), 'switch-button', () => {
            // .catch — якщо завантаження впаде, помилка піде в консоль, а не "загубиться"
            selectTournament(tournament.id).catch(console.error);
        });
        // Активна кнопка — залита чорним (клас active у style.css)
        if (String(tournament.id) === activeTournamentId) {
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');
        } else {
            button.setAttribute('aria-pressed', 'false');
        }
        button.title = tournament.name; // повна назва при наведенні
        buttonsBox.appendChild(button);
    }
}


// Сторінка "Усі турніри"

// Текст "6 команд, 15 матчів" для картки
function getTournamentCountsText(tournamentId) {
    const stats = tournamentStats[tournamentId];
    if (!stats) {
        return '…'; // ще не порахували або запит не вдався
    }
    return pluralize(stats.teams, 'команда', 'команди', 'команд') + ', '
        + pluralize(stats.matches, 'матч', 'матчі', 'матчів');
}

// Малює картки всіх турнірів
function renderTournamentCards() {
    const list = document.getElementById('tournaments-list');
    list.innerHTML = '';

    document.getElementById('tournaments-count').textContent =
        pluralize(tournamentsList.length, 'турнір', 'турніри', 'турнірів') + ' в базі';

    // турнірів немає — показуємо повідомлення
    document.getElementById('tournaments-empty').hidden = tournamentsList.length > 0;

    for (const tournament of tournamentsList) {
        list.appendChild(createTournamentCard(tournament));
    }
}

// Одна картка турніру (режим перегляду)
function createTournamentCard(tournament) {
    const status = getTournamentStatus(tournament);
    const isSelected = String(tournament.id) === activeTournamentId;

    // Клас status-... фарбує смугу, клас selected дає "жорстку" тінь 6px 6px 0
    const card = createElement('article', 'tournament-card status-' + status);
    if (isSelected) {
        card.classList.add('selected');
    }

    // Смуга зі статусом + кнопки редагувати і видалити для організатора
    const band = createElement('div', 'tournament-band');
    band.appendChild(createElement('span', '', TOURNAMENT_STATUS_NAMES[status]));
    const actions = createElement('div', 'card-actions admin-only');
    actions.append(
        createIconButton('edit', 'Редагувати турнір', () => card.replaceWith(createTournamentEditCard(tournament))),
        createIconButton('delete', 'Видалити турнір', () => deleteTournament(tournament)),
    );
    band.appendChild(actions);
    card.appendChild(band);

    // Основна частина: назва, дати, кількість команд і матчів, кнопка
    const body = createElement('div', 'tournament-body');
    body.appendChild(createElement('h3', 'tournament-title', tournament.name));
    body.appendChild(createElement('div', 'tournament-dates-line',
        formatDate(tournament.startDate) + ' – ' + formatDate(tournament.endDate)));

    const footer = createElement('div', 'tournament-footer');
    footer.appendChild(createElement('span', 'tournament-counts', getTournamentCountsText(tournament.id)));

    let chooseButton;
    if (isSelected) {
        // Уже обраний — кнопка просто веде до таблиці
        chooseButton = createButton('Обраний', 'btn btn-dark choose-button', () => showSection('standings'));
        // " — до таблиці" видно тільки на комп'ютері (на телефоні не вміщується)
        chooseButton.appendChild(createElement('span', 'only-desktop', ' — до таблиці'));
    } else {
        chooseButton = createButton('Обрати', 'btn choose-button', async () => {
            showSection('standings');                 // відкриваємо таблицю одразу,
            await selectTournament(tournament.id);    // а дані підвантажуються
        });
    }
    footer.appendChild(chooseButton);
    body.appendChild(footer);
    card.appendChild(body);
    return card;
}

// Картка в режимі редагування (організатор натиснув редагувати)
function createTournamentEditCard(tournament) {
    const card = createElement('article', 'tournament-card edit-card');
    card.appendChild(createElement('div', 'tournament-band', 'Редагування'));

    const nameInput = createInput('text', tournament.name);
    const yearInput = createInput('number', tournament.year);
    const startInput = createInput('date', tournament.startDate);
    const endInput = createInput('date', tournament.endDate);

    const body = createElement('div', 'tournament-body');
    body.append(
        createField('Назва', nameInput),
        createField('Рік', yearInput),
        createField('Початок', startInput),
        createField('Кінець', endInput),
    );

    // Дані збираємо з полів у момент натискання "Зберегти"
    const saveButton = createButton('Зберегти', 'btn btn-accent', () => updateTournament(tournament.id, {
        name: nameInput.value.trim(),
        year: Number(yearInput.value),
        startDate: startInput.value,
        endDate: endInput.value,
    }));
    // "Скасувати" — повертаємо звичайну картку, нічого не відправляючи
    const cancelButton = createButton('Скасувати', 'btn btn-outline', () => card.replaceWith(createTournamentCard(tournament)));

    const buttons = createElement('div', 'edit-actions');
    buttons.append(cancelButton, saveButton);
    body.appendChild(buttons);
    card.appendChild(body);
    return card;
}


// Зміни в турнірах (організатор)

// Обробка форми створення турніру (POST /api/tournaments/)
document.getElementById('tournament-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    // Ключі в camelCase — так їх очікує схема TournamentCreate
    const newTournament = {
        name: document.getElementById('tournament-name').value.trim(),
        year: Number(document.getElementById('tournament-year').value),
        startDate: document.getElementById('tournament-start').value, // формат "2026-09-01"
        endDate: document.getElementById('tournament-end').value,
    };

    const response = await fetch('/api/tournaments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }, 
        body: JSON.stringify(newTournament),
    });

    if (response.ok) {
        const created = await response.json(); // сервер повертає турнір разом з id
        showMessage('tournament-message', 'Турнір «' + created.name + '» створено!', false);
        event.target.reset();
        closeForm('tournament-box'); // ховаємо форму 

        // Одразу робимо новий турнір активним — у ньому ще немає матчів,
        // тож таблиці стануть порожніми, і можна додавати матчі
        await loadTournaments(created.id);
        await reloadTournamentData();
    } else {
        // Наприклад: "Дата завершення не може бути раніше за дату початку"
        showError('tournament-message', await getErrorText(response));
    }
});

// Збереження змін турніру (PATCH /api/tournaments/{id}, схема TournamentUpdate)
async function updateTournament(tournamentId, data) {
    const response = await sendPatch('/api/tournaments/' + tournamentId, data);

    if (response.ok) {
        showMessage('tournament-message', 'Турнір оновлено!', false);
        await loadTournaments();       // нова назва/дати/статус на картках і в шапці
        await reloadTournamentData();  // межі дат могли змінитись
    } else {
        // Картка лишається в режимі редагування, щоб можна було виправити дані
        showError('tournament-message', await getErrorText(response));
    }
}

// Видалення турніру (DELETE /api/tournaments/{id}) — кнопка видалити на картці
async function deleteTournament(tournament) {
    if (!confirm('Видалити турнір «' + tournament.name + '»?')) {
        return;
    }

    const response = await fetch('/api/tournaments/' + tournament.id, {
        method: 'DELETE',
        headers: authHeaders(), 
    });

    if (response.ok) {
        showMessage('tournament-message', 'Турнір видалено', false);
        // Якщо видалили обраний турнір — забуваємо його, і правило обере новий
        if (String(tournament.id) === activeTournamentId) {
            activeTournamentId = '';
            forgetSavedTournament();
        }
        await loadTournaments();
        await reloadTournamentData();
    } else {
        // Наприклад: "Неможливо видалити турнір, у якому є матчі (45)"
        showError('tournament-message', await getErrorText(response));
    }
}