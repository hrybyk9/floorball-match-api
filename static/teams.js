// teams.js — команди: картки, додавання, редагування, видалення.

// Завантажує команди з сервера і оновлює картки та всі випадаючі списки команд
async function loadTeams() {
    // fetch відправляє GET-запит; await — чекаємо відповідь сервера
    const response = await fetch('/api/teams');
    // Якщо сервер повернув помилку (404, 500...) — зупиняємось і показуємо її в консолі
    if (!response.ok) {
        throw new Error('Не вдалося завантажити команди: код ' + response.status);
    }
    // Перетворюємо відповідь з JSON у масив об'єктів JavaScript
    teamsList = await response.json();

    // 1) Перемальовуємо картки команд
    renderTeamCards();

    // 2) Оновлюємо випадаючі списки команд у формах
    fillTeamSelect();        // у формах гравця, імпорту і фільтрі 
    fillMatchTeamSelects();  // у формі матчу 
}

// Фільтр над картками: 'tournament' — лише учасники обраного турніру, 'all' — усі команди з бази
let teamsFilter = 'tournament';

// Повертає команди, які треба показати з урахуванням фільтра.
// Учасники турніру — ті, хто є в турнірній таблиці (standingsList):
// сервер кладе туди всіх, хто має хоча б один матч у цьому турнірі
function getVisibleTeams() {
    if (teamsFilter === 'all' || !getActiveTournamentId()) {
        return teamsList; // турнір не обрано — показуємо всі команди
    }
    // Set з id учасників — швидко перевіряти "чи є команда в турнірі"
    const participantIds = new Set(standingsList.map(row => row.teamId));
    return teamsList.filter(team => participantIds.has(team.id));
}

// Малює картки команд.
// Викликається, коли змінились команди, турнірна таблиця (місце/очки) або гравці (кількість)
function renderTeamCards() {
    const grid = document.getElementById('teams-grid');
    grid.innerHTML = ''; // очищаємо старі картки

    const visibleTeams = getVisibleTeams();

    // "6 команд у турнірі" або "10 команд у базі"
    const place = teamsFilter === 'all' ? ' у базі' : ' у турнірі';
    document.getElementById('teams-count').textContent =
        pluralize(visibleTeams.length, 'команда', 'команди', 'команд') + place;

    if (visibleTeams.length === 0) {
        const text = teamsList.length === 0
            ? 'Команд ще немає'
            : 'У цьому турнірі ще немає матчів, тому й команд-учасниць немає';
        grid.appendChild(createElement('p', 'empty-text', text));
        return;
    }

    for (const team of visibleTeams) {
        grid.appendChild(createTeamCard(team));
    }
}

// Змінює фільтр і підсвічує активну вкладку "У турнірі / Усі команди"
function setTeamsFilter(filter) {
    teamsFilter = filter;
    for (const tab of document.querySelectorAll('.teams-tab')) {
        const isActive = tab.dataset.filter === filter;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-pressed', String(isActive));
    }
    renderTeamCards();
}

// Кліки по вкладках над картками команд
for (const tab of document.querySelectorAll('.teams-tab')) {
    tab.addEventListener('click', () => setTeamsFilter(tab.dataset.filter));
}

// Текст "1 місце · 13 очок" для команди в обраному турнірі
// (або "не грає в турнірі", якщо команди немає в турнірній таблиці)
function getTeamPlaceText(teamId) {
    const row = standingsList.find(item => item.teamId === teamId);
    if (!row) {
        return 'не грає в турнірі';
    }
    return row.position + ' місце · ' + pluralize(row.points, 'очко', 'очки', 'очок');
}

// Одна картка команди (режим перегляду)
function createTeamCard(team) {
    const card = createElement('article', 'team-card');

    card.appendChild(createElement('h3', 'team-card-name', team.name));

    // Права частина картки: місце (на телефоні) + кнопки редагувати і видалити (тільки організатор)
    const side = createElement('div', 'team-card-side');
    const row = standingsList.find(item => item.teamId === team.id);
    side.appendChild(createElement('span', 'team-card-place', row ? row.position + ' місце' : '—'));
    const actions = createElement('div', 'card-actions admin-only');
    actions.append(
        // "Редагувати": замінюємо цю картку на картку з полями введення
        createIconButton('edit', 'Редагувати команду', () => card.replaceWith(createTeamEditCard(team))),
        createIconButton('delete', 'Видалити команду', () => deleteTeam(team.id)),
    );
    side.appendChild(actions);
    card.appendChild(side);

    // founded_year у Python -> foundedYear у JSON (camelCase)
    card.appendChild(createElement('div', 'team-card-meta', team.city + ', засн. у ' + team.foundedYear));

    // "1 місце · 13 очок · 6 гравців" (на телефоні цей рядок схований — див. style.css)
    const playersText = pluralize(playerCounts[team.id] || 0, 'гравець', 'гравці', 'гравців');
    card.appendChild(createElement('div', 'team-card-stats', getTeamPlaceText(team.id) + ' · ' + playersText));

    return card;
}

// Картка в режимі редагування: замість тексту — поля з поточними значеннями
function createTeamEditCard(team) {
    const card = createElement('article', 'team-card edit-card');

    const nameInput = createInput('text', team.name);
    const cityInput = createInput('text', team.city);
    const yearInput = createInput('number', team.foundedYear);

    card.append(
        createField('Назва', nameInput),
        createField('Місто', cityInput),
        createField('Рік заснування', yearInput),
    );

    // Дані збираємо з полів у момент натискання "Зберегти"
    const saveButton = createButton('Зберегти', 'btn btn-accent', () => updateTeam(team.id, {
        name: nameInput.value.trim(),
        city: cityInput.value.trim(),
        foundedYear: Number(yearInput.value),
    }));
    // "Скасувати" — повертаємо звичайну картку зі старими даними, нічого не відправляючи
    const cancelButton = createButton('Скасувати', 'btn btn-outline', () => card.replaceWith(createTeamCard(team)));

    const buttons = createElement('div', 'edit-actions');
    buttons.append(cancelButton, saveButton);
    card.appendChild(buttons);
    return card;
}

// Збереження змін команди (PATCH /api/teams/{id})
async function updateTeam(teamId, data) {
    const response = await sendPatch('/api/teams/' + teamId, data);

    if (response.ok) {
        showMessage('team-message', 'Команду оновлено!', false);
        // Назва команди показується в багатьох місцях — оновлюємо все
        await loadTeams();     // картки команд + випадаючі списки
        await loadPlayers();   // колонка "Команда" у гравців
        await loadMatches();   // господарі/гості в матчах, "Результати", "Наступна гра"
        await loadStandings(); // турнірна таблиця
    } else {
        // Наприклад, порожня назва або рік поза межами -> alert з текстом від сервера.
        // Картка лишається в режимі редагування, щоб можна було виправити дані
        showError('team-message', await getErrorText(response));
    }
}

// Обробка форми додавання команди
document.getElementById('team-form').addEventListener('submit', async (event) => {
    // Забороняємо браузеру перезавантажувати сторінку при відправці форми
    event.preventDefault();

    const newTeam = {
        name: document.getElementById('team-name').value.trim(),
        city: document.getElementById('team-city').value.trim(),
        // Number() — бо значення з input завжди рядок
        foundedYear: Number(document.getElementById('team-founded-year').value),
    };

    const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }, // Етап 9: + токен адміністратора
        body: JSON.stringify(newTeam), // об'єкт -> JSON-рядок
    });

    if (response.ok) {
        showMessage('team-message', 'Команду додано!', false);
        event.target.reset();  // очищаємо поля форми
        await loadTeams();     // оновлюємо картки і списки команд у формах
        await loadStandings(); // турнірна таблиця і місця на картках
    } else {
        // Показуємо текст від сервера, наприклад "Команда з такою назвою вже існує"
        showError('team-message', await getErrorText(response));
    }
});

// Видалення команди за id (DELETE /api/teams/{id})
async function deleteTeam(teamId) {
    // Попереджаємо, що разом з командою видаляться і її гравці
    if (!confirm('Видалити цю команду? Усі її гравці теж будуть видалені.')) {
        return;
    }

    const response = await fetch('/api/teams/' + teamId, {
        method: 'DELETE',
        headers: authHeaders(), 
    });

    if (response.ok) {
        showMessage('team-message', 'Команду видалено', false);
        // Оновлюємо все, що залежить від команд:
        await loadTeams();     // картки команд і випадаючі списки
        await loadPlayers();   // гравці цієї команди видалились разом з нею
        await loadStandings(); // команда зникла з турнірної таблиці
    } else {
        // Наприклад: "Неможливо видалити команду, яка має матчі" -> alert, як і в інших розділах
        showError('team-message', await getErrorText(response));
    }
}