// matches.js — матчі обраного турніру, внесення рахунку, блоки "Результати" і "Наступна гра",а також турнірна таблиця.

// Переклад статусів матчу з англійської (як у базі) українською (для сторінки)
const STATUS_NAMES = {
    scheduled: 'Заплановано',
    live: 'Триває',
    finished: 'Зіграно',
};

// Кількість колонок у турнірній таблиці — потрібна для рядка-підказки "немає даних"
const STANDINGS_COLUMNS = 10;

// Скільки останніх результатів показувати в блоці "Результати"
const RESULTS_LIMIT = 4;

// Матчі обраного турніру (останнє завантаження з сервера)
let matchesList = [];

// Фільтр над списком матчів: 'all' (усі), 'scheduled' (заплановані), 'finished' (зіграні)
let matchesFilter = 'all';

// id матчу, для якого зараз відкрите вікно "Рахунок матчу"
let scoreMatchId = null;


// Допоміжні функції

// Заповнює два <select> у формі матчу: "Господарі" і "Гості".
// Групи "Учасники турніру / Інші команди" будує fillSelectWithTeams
function fillMatchTeamSelects() {
    fillSelectWithTeams('match-home-team', '— оберіть —');
    fillSelectWithTeams('match-away-team', '— оберіть —');
}

// Копія списку матчів, відсортована за датою.
// newestFirst = true — найновіші зверху (як у списку "Матчі"), false — найближчі зверху.
// Дати "2026-11-01T18:00:00" можна порівнювати як рядки
function sortMatchesByDate(matches, newestFirst) {
    const sorted = [...matches]; // [...] — копія, щоб не змінювати оригінальний масив
    sorted.sort((a, b) => a.date.localeCompare(b.date));
    if (newestFirst) {
        sorted.reverse();
    }
    return sorted;
}

// Час "18:00" з рядка дати "2026-11-01T18:00:00"
function getMatchTime(match) {
    return match.date.slice(11, 16);
}

// Скорочений день тижня українською: "нд", "сб"...
function getMatchWeekday(match) {
    return new Date(match.date).toLocaleDateString('uk-UA', { weekday: 'short' });
}


// Завантаження матчів

// Завантажує матчі обраного турніру і перемальовує все, що від них залежить
async function loadMatches() {
    // беремо id турніру, обраного користувачем
    const tournamentId = getActiveTournamentId();

    if (!tournamentId) {
        // Турнірів ще немає — нема чого завантажувати
        matchesList = [];
    } else {
        // Сервер поверне тільки матчі цього турніру (фільтр ?tournament_id=...)
        const response = await fetch('/api/matches/?tournament_id=' + tournamentId);
        // Якщо сервер повернув помилку (404, 500...) — зупиняємось і показуємо її в консолі
        if (!response.ok) {
            throw new Error('Не вдалося завантажити матчі: код ' + response.status);
        }
        matchesList = await response.json();

        // Цифри "6 команд, 15 матчів" на картці цього турніру могли змінитись
        tournamentStats[tournamentId] = countTournamentStats(matchesList);
        renderTournamentCards();
    }

    renderMatchesList();
    renderResults();
    renderNextGame();
}


// Список матчів

// Малює список матчів з урахуванням фільтра "Усі / Заплановані / Зіграні"
function renderMatchesList() {
    const list = document.getElementById('matches-list');
    list.innerHTML = '';

    document.getElementById('matches-count').textContent =
        pluralize(matchesList.length, 'матч', 'матчі', 'матчів') + ' у турнірі';

    if (!getActiveTournamentId()) {
        list.appendChild(createElement('p', 'empty-text', 'Оберіть або створіть турнір'));
        return;
    }

    // Залишаємо тільки ті матчі, що підходять під фільтр
    let filtered = matchesList;
    if (matchesFilter === 'finished') {
        filtered = matchesList.filter(m => m.status === 'finished');
    } else if (matchesFilter === 'scheduled') {
        filtered = matchesList.filter(m => m.status !== 'finished'); // заплановані й поточні
    }

    if (filtered.length === 0) {
        const text = matchesList.length === 0 ? 'У цьому турнірі ще немає матчів' : 'Таких матчів немає';
        list.appendChild(createElement('p', 'empty-text', text));
        return;
    }

    for (const match of sortMatchesByDate(filtered, true)) {
        list.appendChild(createMatchRow(match));
    }
}

// Змінює фільтр і підсвічує активну вкладку
function setMatchesFilter(filter) {
    matchesFilter = filter;
    for (const tab of document.querySelectorAll('.matches-tab')) {
        const isActive = tab.dataset.filter === filter;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-pressed', String(isActive));
    }
    renderMatchesList();
}

// Кліки по вкладках "Усі / Заплановані / Зіграні"
for (const tab of document.querySelectorAll('.matches-tab')) {
    tab.addEventListener('click', () => setMatchesFilter(tab.dataset.filter));
}

// Посилання "усі матчі турніру" під "Результатами"
// (атрибут data-go), а тут лише скидаємо фільтр на "Усі"
document.getElementById('results-all-link').addEventListener('click', () => setMatchesFilter('all'));

// Один рядок матчу (режим перегляду).
// Розташування частин рядка (у рядок на комп'ютері, карткою на телефоні) задає CSS grid
function createMatchRow(match) {
    const row = createElement('div', 'match-row');

    // Дата і час: "15.11.2026" і "нд 16:00" (день тижня — тільки на комп'ютері)
    const dateBox = createElement('div', 'match-date');
    dateBox.appendChild(createElement('span', 'match-day', formatDate(match.date)));
    const timeBox = createElement('span', 'match-time');
    timeBox.appendChild(createElement('span', 'only-desktop', getMatchWeekday(match) + ' '));
    timeBox.append(getMatchTime(match));
    dateBox.appendChild(timeBox);
    row.appendChild(dateBox);

    row.appendChild(createElement('div', 'match-team match-home', getTeamName(match.homeTeamId)));

    // Рахунок: у зіграного — чорний блок "4:6", у запланованого — пунктирна рамка "–:–"
    if (match.status === 'finished') {
        row.appendChild(createElement('div', 'match-score', match.homeScore + ':' + match.awayScore));
    } else {
        const emptyScore = createElement('div', 'match-score empty', '–:–');
        emptyScore.title = 'Рахунку ще немає';
        row.appendChild(emptyScore);
    }

    row.appendChild(createElement('div', 'match-team match-away', getTeamName(match.awayTeamId)));

    // Статус (клас status-... задає колір) і місце проведення
    row.appendChild(createElement('div', 'match-status status-' + match.status,
        STATUS_NAMES[match.status] || match.status));
    row.appendChild(createElement('div', 'match-venue', match.venue));

    // Кнопки організатора: рахунок, редагувати і видалити
    const actions = createElement('div', 'match-actions admin-only');
    const scoreButton = createButton('', 'score-button', () => openScoreDialog(match));
    scoreButton.title = 'Внести рахунок';
    // На комп'ютері маленька кнопка "0:0", на телефоні широка "Внести рахунок"
    scoreButton.append(
        createElement('span', 'only-desktop', '0:0'),
        createElement('span', 'only-mobile', 'Внести рахунок'),
    );
    actions.append(
        scoreButton,
        createIconButton('edit', 'Редагувати матч', () => row.replaceWith(createMatchEditRow(match))),
        createIconButton('delete', 'Видалити матч', () => deleteMatch(match.id)),
    );
    row.appendChild(actions);

    return row;
}

// Рядок матчу в режимі редагування : можна змінити дату, команди і місце.
// Рахунок тут не редагуємо — для нього є окрема кнопка "0:0" / "Внести рахунок".
// Турнір теж не змінюємо: tournamentId не надсилаємо, тож на сервері він лишиться старим
function createMatchEditRow(match) {
    const row = createElement('div', 'match-row edit-mode');

    // Сервер віддає дату як "2026-11-01T18:00:00", а поле datetime-local
    // приймає формат "2026-11-01T18:00" — тому беремо перші 16 символів
    const dateInput = createInput('datetime-local', match.date.slice(0, 16));
    const homeSelect = createSelect(getTeamOptions(), match.homeTeamId);
    const awaySelect = createSelect(getTeamOptions(), match.awayTeamId);
    const venueInput = createInput('text', match.venue);

    const grid = createElement('div', 'form-grid');
    grid.append(
        createField('Дата й час', dateInput),
        createField('Господарі', homeSelect),
        createField('Гості', awaySelect),
        createField('Місце', venueInput),
    );

    const saveButton = createButton('Зберегти', 'btn btn-accent', () => updateMatch(match.id, {
        homeTeamId: Number(homeSelect.value),
        awayTeamId: Number(awaySelect.value),
        date: dateInput.value,
        venue: venueInput.value.trim(),
    }));
    const cancelButton = createButton('Скасувати', 'btn btn-outline', () => row.replaceWith(createMatchRow(match)));

    const buttons = createElement('div', 'form-actions');
    buttons.append(cancelButton, saveButton);
    grid.appendChild(buttons);
    row.appendChild(grid);
    return row;
}


// Блоки "Результати" і "Наступна гра"

// "Результати" праворуч від таблиці: останні зіграні матчі, найновіші зверху
function renderResults() {
    const list = document.getElementById('results-list');
    list.innerHTML = '';

    const finished = matchesList.filter(m => m.status === 'finished');
    if (finished.length === 0) {
        list.appendChild(createElement('p', 'empty-text', 'Зіграних матчів ще немає'));
        return;
    }

    // slice(0, 4) — беремо перші 4 після сортування
    for (const match of sortMatchesByDate(finished, true).slice(0, RESULTS_LIMIT)) {
        const item = createElement('div', 'result-item');
        item.appendChild(createElement('div', 'result-date', formatDate(match.date)));
        const line = createElement('div', 'result-line');
        line.append(
            createElement('span', 'result-team', getTeamName(match.homeTeamId)),
            createElement('span', 'result-score', match.homeScore + ':' + match.awayScore),
            createElement('span', 'result-team result-away', getTeamName(match.awayTeamId)),
        );
        item.appendChild(line);
        list.appendChild(item);
    }
}

// "Наступна гра": найближчий за датою матч, який ще не зіграно
function renderNextGame() {
    const teamsBox = document.getElementById('next-game-teams');
    const whenBox = document.getElementById('next-game-when');
    const whenShortBox = document.getElementById('next-game-when-short');
    const venueBox = document.getElementById('next-game-venue');

    const notFinished = matchesList.filter(m => m.status !== 'finished');
    if (notFinished.length === 0) {
        teamsBox.textContent = 'Запланованих матчів немає';
        whenBox.textContent = '';
        whenShortBox.textContent = '';
        venueBox.textContent = '';
        return;
    }

    const next = sortMatchesByDate(notFinished, false)[0]; // [0] — найближчий
    // "15.11" — день і місяць з рядка "2026-11-15T16:00:00"
    const dayMonth = next.date.slice(8, 10) + '.' + next.date.slice(5, 7);

    teamsBox.textContent = getTeamName(next.homeTeamId) + ' — ' + getTeamName(next.awayTeamId);
    whenBox.textContent = dayMonth + ' · ' + getMatchTime(next);           // комп'ютер
    whenShortBox.textContent = ' · ' + dayMonth + ', ' + getMatchTime(next); // телефон (у підписі)
    venueBox.textContent = next.venue;
}


// Зміни в матчах (організатор

// Збереження змін матчу (PATCH /api/matches/{id})
async function updateMatch(matchId, data) {
    const response = await sendPatch('/api/matches/' + matchId, data);

    if (response.ok) {
        showMessage('match-message', 'Матч оновлено!', false);
        await loadMatches();
        await loadStandings(); // якщо змінили команди завершеного матчу — зміняться очки
    } else {
        // Наприклад: дата поза межами турніру -> "Дата матчу має бути в межах турніру..."
        showError('match-message', await getErrorText(response));
    }
}

// Обробка форми створення матчу (POST /api/matches/)
document.getElementById('match-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    // матч створюється в турнірі, обраному користувачем
    const tournamentId = getActiveTournamentId();
    if (!tournamentId) {
        showError('match-message', 'Спочатку створіть або оберіть турнір');
        return;
    }

    // Ключі в camelCase — так їх очікує схема MatchCreate
    const newMatch = {
        tournamentId: Number(tournamentId), // автоматична підстановка обраного турніру
        homeTeamId: Number(document.getElementById('match-home-team').value),
        awayTeamId: Number(document.getElementById('match-away-team').value),
        date: document.getElementById('match-date').value, // формат "2026-11-01T18:00"
        venue: document.getElementById('match-venue').value.trim(),
    };

    const response = await fetch('/api/matches/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(newMatch),
    });

    if (response.ok) {
        showMessage('match-message', 'Матч створено!', false);
        event.target.reset();
        await loadMatches();
        await loadStandings(); // нова команда-учасниця з'явиться в таблиці з нулями
    } else {
        // Наприклад: "Команда не може грати сама проти себе" -> alert
        showError('match-message', await getErrorText(response));
    }
});

// Завершення матчу з рахунком (PATCH /api/matches/{id}/score).
// Повертає true, якщо сервер прийняв рахунок (тоді вікно рахунку закриваємо)
async function finishMatch(matchId, homeScore, awayScore) {
    const scoreData = {
        homeScore: Number(homeScore), // з поля приходить рядок — перетворюємо в число
        awayScore: Number(awayScore),
        status: 'finished',
    };

    const response = await fetch('/api/matches/' + matchId + '/score', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }, 
        body: JSON.stringify(scoreData),
    });

    if (response.ok) {
        showMessage('match-message', 'Рахунок збережено!', false);
        // Оновлюємо і матчі, і турнірну таблицю (там змінились очки)
        await loadMatches();
        await loadStandings();
        return true;
    }
    // Наприклад, від'ємний рахунок -> сервер відхилить, покажемо alert
    showError('match-message', await getErrorText(response));
    return false;
}

// Видалення матчу (DELETE /api/matches/{id})
async function deleteMatch(matchId) {
    if (!confirm('Видалити цей матч?')) {
        return;
    }

    const response = await fetch('/api/matches/' + matchId, {
        method: 'DELETE',
        headers: authHeaders(), 
    });

    if (response.ok) {
        showMessage('match-message', 'Матч видалено', false);
        await loadMatches();
        await loadStandings(); // якщо матч був завершений — очки теж зміняться
    } else {
        showError('match-message', await getErrorText(response));
    }
}


// Вікно "Рахунок матчу"

const scoreDialog = document.getElementById('score-dialog');

// Відкриває вікно рахунку для матчу
function openScoreDialog(match) {
    scoreMatchId = match.id; // запам'ятовуємо, який матч оновлюємо
    document.getElementById('score-home-name').textContent = getTeamName(match.homeTeamId);
    document.getElementById('score-away-name').textContent = getTeamName(match.awayTeamId);
    // Якщо матч уже зіграно — підставляємо його рахунок, щоб можна було виправити
    const isFinished = match.status === 'finished';
    document.getElementById('score-home').value = isFinished ? match.homeScore : 0;
    document.getElementById('score-away').value = isFinished ? match.awayScore : 0;
    scoreDialog.showModal();
    document.getElementById('score-home').select();
}

document.getElementById('score-close').addEventListener('click', () => scoreDialog.close());
document.getElementById('score-cancel').addEventListener('click', () => scoreDialog.close());

// "Зберегти" у вікні рахунку
document.getElementById('score-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const saved = await finishMatch(
        scoreMatchId,
        document.getElementById('score-home').value,
        document.getElementById('score-away').value,
    );
    if (saved) {
        scoreDialog.close(); // при помилці вікно лишається, щоб виправити цифри
    }
});


// ТУРНІРНА ТАБЛИЦЯ

// Завантажує таблицю обраного турніру (GET /api/standings/?tournament_id=...) і малює її
async function loadStandings() {
    const tbody = document.getElementById('standings-table-body');
    const tournamentId = getActiveTournamentId();

    if (!tournamentId) {
        standingsList = [];
        renderTeamCards();       // на картках команд зникнуть місця
        fillMatchTeamSelects();  // у формі матчу — без групи "Учасники турніру"
        fillTeamSelect();        // і в списках команд на сторінці "Гравці"
        renderPlayersTable();    // таблиця гравців — без фільтра за турніром
        tbody.innerHTML = '';
        tbody.appendChild(createEmptyRow('Оберіть або створіть турнір', STANDINGS_COLUMNS));
        return;
    }

    // На сервері tournament_id обов'язковий — без нього буде помилка 422
    const response = await fetch('/api/standings/?tournament_id=' + tournamentId);
    if (!response.ok) {
        throw new Error('Не вдалося завантажити турнірну таблицю: код ' + response.status);
    }
    standingsList = await response.json();
    renderTeamCards();       // "1 місце · 13 очок" на картках команд
    fillMatchTeamSelects();  // групи "Учасники турніру / Інші команди" у формі матчу
    fillTeamSelect();        // ті самі групи у фільтрі, формі гравця та імпорті CSV
    renderPlayersTable();    // гравці команд-учасниць нового обраного турніру

    tbody.innerHTML = '';

    if (standingsList.length === 0) {
        tbody.appendChild(createEmptyRow('Таблиця з’явиться після додавання матчів', STANDINGS_COLUMNS));
        return;
    }

    // Сервер уже відсортував команди за очками, різницею голів і забитими голами
    for (const item of standingsList) {
        const row = document.createElement('tr');
        // Перші три місця затінені (клас top-three у style.css)
        if (item.position <= 3) {
            row.className = 'top-three';
        }

        row.appendChild(createCell(item.position, 'col-pos'));

        // "Lemberg · Львів" — на телефоні місто переходить другим рядком (style.css)
        const teamCell = createCell('', 'col-team');
        teamCell.append(
            createElement('span', 'team-name', item.teamName),
            createElement('span', 'team-city', getTeamCity(item.teamId)),
        );
        teamCell.title = item.teamName; // повна назва при наведенні, якщо обрізана "…"
        row.appendChild(teamCell);

        row.appendChild(createCell(item.played, 'num'));
        row.appendChild(createCell(item.wins, 'num'));
        row.appendChild(createCell(item.draws, 'num'));
        row.appendChild(createCell(item.losses, 'num'));
        row.appendChild(createCell(item.goalsFor, 'num'));
        row.appendChild(createCell(item.goalsAgainst, 'num'));
        row.appendChild(createCell(formatGoalDifference(item.goalDifference), 'num col-gd'));
        // Очки — жирні (клас col-points)
        row.appendChild(createCell(item.points, 'num col-points'));

        tbody.appendChild(row);
    }
}