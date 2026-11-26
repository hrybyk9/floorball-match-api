// players.js — гравці: таблиця, фільтр за командою, додавання, імпорт з CSV, редагування, видалення.

// Цю функцію використовують форма гравця, фільтр, імпорт CSV і форма матчу
function fillSelectWithTeams(selectId, firstOptionText) {
    const select = document.getElementById(selectId);
    const oldValue = select.value; // запам'ятовуємо вибір, щоб не скинути його

    // Залишаємо тільки перший пункт-підказку
    select.innerHTML = '';
    select.appendChild(new Option(firstOptionText, ''));

    // id учасників обраного турніру (Set — щоб швидко перевіряти "чи є в турнірі")
    const participantIds = new Set(standingsList.map(row => row.teamId));
    const participants = teamsList.filter(team => participantIds.has(team.id));
    const others = teamsList.filter(team => !participantIds.has(team.id));

    // Додаємо групу, тільки якщо в ній є команди
    if (participants.length > 0) {
        select.appendChild(createTeamGroup('Учасники турніру', participants));
    }
    if (others.length > 0) {
        // Якщо учасників ще немає (новий турнір) — підзаголовок "Усі команди"
        const label = participants.length > 0 ? 'Інші команди' : 'Усі команди';
        select.appendChild(createTeamGroup(label, others));
    }

    // Повертаємо попередній вибір (якщо така команда ще існує)
    if (teamsList.some(t => String(t.id) === oldValue)) {
        select.value = oldValue;
    }
}

// Створює <optgroup label="..."> з командами всередині
function createTeamGroup(label, teams) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const team of teams) {
        // new Option(текст, значення) — створює елемент <option>
        group.appendChild(new Option(team.name, team.id));
    }
    return group;
}

// Заповнює всі списки команд, що стосуються гравців
function fillTeamSelect() {
    fillSelectWithTeams('player-team', '— оберіть —');     // форма гравця
    fillSelectWithTeams('import-team', '— команда —');     // форма імпорту CSV
    fillSelectWithTeams('players-filter', 'усі команди');  // фільтр над таблицею
}

// Гравці, отримані з сервера останнім запитом (з урахуванням фільтра за командою)
let playersList = [];

// Вкладка над таблицею: 'tournament' — лише гравці команд-учасниць обраного турніру,
// 'all' — усі гравці з бази
let playersScope = 'tournament';

// Завантажує гравців і малює таблицю
async function loadPlayers() {
    // Якщо у фільтрі обрано команду — просимо в сервера тільки її гравців
    // (наш GET /api/players вже вміє фільтрувати через ?team_id=...)
    const teamId = document.getElementById('players-filter').value;
    const url = teamId ? '/api/players?team_id=' + teamId : '/api/players';

    const response = await fetch(url);
    // Якщо сервер повернув помилку (404, 500...) — зупиняємось і показуємо її в консолі
    if (!response.ok) {
        throw new Error('Не вдалося завантажити гравців: код ' + response.status);
    }
    playersList = await response.json();

    renderPlayersTable();

    // Кількість гравців у командах (для карток команд) теж могла змінитись
    await loadPlayerCounts();
}

// Повертає гравців, яких треба показати з урахуванням вкладки.
// Гравець "у турнірі", якщо його команда є в турнірній таблиці (standingsList),
// тобто має хоча б один матч в обраному турнірі
function getVisiblePlayers() {
    if (playersScope === 'all' || !getActiveTournamentId()) {
        return playersList; // турнір не обрано — показуємо всіх
    }
    // Set з id команд-учасниць — швидко перевіряти "чи грає команда в турнірі"
    const participantIds = new Set(standingsList.map(row => row.teamId));
    return playersList.filter(player => participantIds.has(player.teamId));
}

// Малює таблицю гравців (без нового запиту до сервера).
// Викликається після завантаження гравців, зміни вкладки і зміни турніру
function renderPlayersTable() {
    const visiblePlayers = getVisiblePlayers();

    // Лічильник праворуч від заголовка: "120 гравців у турнірі" або "200 гравців у базі"
    const place = playersScope === 'all' ? ' у базі' : ' у турнірі';
    document.getElementById('players-count').textContent =
        pluralize(visiblePlayers.length, 'гравець', 'гравці', 'гравців') + place;

    const tbody = document.getElementById('players-table-body');
    tbody.innerHTML = '';

    if (visiblePlayers.length === 0) {
        let text = 'Гравців ще немає';
        if (playersList.length > 0 && standingsList.length === 0) {
            // У турнірі ще немає матчів — отже, немає й команд-учасниць
            text = 'У цьому турнірі ще немає матчів — гравців усіх команд видно у вкладці «Усі гравці»';
        } else if (playersList.length > 0) {
            // Гравці є, але не в командах-учасницях (наприклад, обрали команду, що не грає в турнірі)
            text = 'Ці гравці не грають в обраному турнірі — відкрийте вкладку «Усі гравці»';
        }
        tbody.appendChild(createEmptyRow(text, PLAYERS_COLUMNS));
        return;
    }
    for (const player of visiblePlayers) {
        tbody.appendChild(createPlayerRow(player));
    }
}

// Змінює вкладку "У турнірі / Усі гравці" і підсвічує активну
function setPlayersScope(scope) {
    playersScope = scope;
    for (const tab of document.querySelectorAll('.players-tab')) {
        const isActive = tab.dataset.filter === scope;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-pressed', String(isActive));
    }
    renderPlayersTable();
}

// Кліки по вкладках над таблицею гравців
for (const tab of document.querySelectorAll('.players-tab')) {
    tab.addEventListener('click', () => setPlayersScope(tab.dataset.filter));
}

// Рахує, скільки гравців у кожній команді, — для карток "… · 6 гравців".
// Беремо ВСІХ гравців (без фільтра), бо фільтр стосується лише таблиці
async function loadPlayerCounts() {
    const response = await fetch('/api/players');
    if (!response.ok) {
        throw new Error('Не вдалося порахувати гравців: код ' + response.status);
    }
    const allPlayers = await response.json();

    const counts = {};
    for (const player of allPlayers) {
        // (counts[...] || 0) — якщо команди ще немає в об'єкті, починаємо з нуля
        counts[player.teamId] = (counts[player.teamId] || 0) + 1;
    }
    playerCounts = counts;
    renderTeamCards(); // teams.js
}

// Кількість колонок у таблиці гравців (для рядка "Гравців ще немає")
const PLAYERS_COLUMNS = 5;

// Позиції гравців для випадаючого списку при редагуванні: [значення, текст]
const POSITION_OPTIONS = [
    ['Воротар', 'Воротар'],
    ['Захисник', 'Захисник'],
    ['Нападник', 'Нападник'],
];


// Звичайний рядок таблиці (режим ПЕРЕГЛЯДУ)
function createPlayerRow(player) {
    const row = document.createElement('tr');
    // Сервер повертає поля в camelCase (firstName, teamId тощо),
    // бо так налаштовані наші Pydantic-схеми

    // shirt_number у Python -> shirtNumber у JSON
    row.appendChild(createCell(player.shirtNumber, 'player-number'));

    // Ім'я і прізвище в одній колонці "Гравець".
    // На телефоні під ім'ям ще рядок "воротар · Lemberg", а колонки Позиція/Команда сховані
    const nameCell = createCell('', 'player-name');
    nameCell.appendChild(createElement('span', '', player.firstName + ' ' + player.lastName));
    nameCell.appendChild(createElement('span', 'player-sub',
        player.position.toLowerCase() + ' · ' + getTeamName(player.teamId)));
    row.appendChild(nameCell);

    row.appendChild(createCell(player.position, 'player-position hide-mobile'));
    row.appendChild(createCell(getTeamName(player.teamId), 'player-team hide-mobile'));

    // Колонка "Дії" — тільки для адміністратора
    const actionsCell = wrapInCell(
        createIconButton('edit', 'Редагувати гравця', () => row.replaceWith(createPlayerEditRow(player))),
        createIconButton('delete', 'Видалити гравця', () => deletePlayer(player.id)),
    );
    actionsCell.className = 'cell-actions admin-only';
    row.appendChild(actionsCell);
    return row;
}

// Рядок у режимі редагування
function createPlayerEditRow(player) {
    const row = document.createElement('tr');
    row.className = 'edit-row';

    const numberInput = createInput('number', player.shirtNumber);
    const firstNameInput = createInput('text', player.firstName);
    const lastNameInput = createInput('text', player.lastName);
    // Позиція і команда — списки, щоб не можна було ввести щось неіснуюче
    const positionSelect = createSelect(POSITION_OPTIONS, player.position);
    const teamSelect = createSelect(getTeamOptions(), player.teamId);

    // aria-label — підпис поля для програм читання з екрана (видимого підпису в рядку немає)
    numberInput.setAttribute('aria-label', 'Номер');
    firstNameInput.setAttribute('aria-label', "Ім'я");
    lastNameInput.setAttribute('aria-label', 'Прізвище');
    positionSelect.setAttribute('aria-label', 'Позиція');
    teamSelect.setAttribute('aria-label', 'Команда');

    row.appendChild(wrapInCell(numberInput));
    const nameCell = wrapInCell(firstNameInput, lastNameInput);
    nameCell.className = 'edit-name-cell';
    row.appendChild(nameCell);
    row.appendChild(wrapInCell(positionSelect));
    row.appendChild(wrapInCell(teamSelect));

    const saveButton = createButton('Зберегти', 'btn btn-accent', () => updatePlayer(player.id, {
        firstName: firstNameInput.value.trim(),
        lastName: lastNameInput.value.trim(),
        position: positionSelect.value,
        shirtNumber: Number(numberInput.value),
        teamId: Number(teamSelect.value), // гравця можна перевести в іншу команду
    }));
    const cancelButton = createButton('Скасувати', 'btn btn-outline', () => row.replaceWith(createPlayerRow(player)));

    const actionsCell = wrapInCell(cancelButton, saveButton);
    actionsCell.className = 'cell-actions admin-only';
    row.appendChild(actionsCell);
    return row;
}

// Збереження змін гравця (PATCH /api/players/{id})
async function updatePlayer(playerId, data) {
    const response = await sendPatch('/api/players/' + playerId, data);

    if (response.ok) {
        showMessage('player-message', 'Гравця оновлено!', false);
        await loadPlayers();
    } else {
        // Наприклад: змінили позицію воротаря з номером 1 на "Нападник" ->
        // сервер відповість "Номер 1 може мати тільки воротар"
        showError('player-message', await getErrorText(response));
    }
}

// Зміна фільтра -> перезавантажуємо таблицю гравців
document.getElementById('players-filter').addEventListener('change', () => {
    // .catch — якщо завантаження впаде, помилка піде в консоль, а не "загубиться"
    loadPlayers().catch(console.error);
});

// Обробка форми додавання гравця
document.getElementById('player-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    // Збираємо дані з полів форми в об'єкт.
    // Ключі в camelCase — саме так їх очікують наші Pydantic-схеми.
    const newPlayer = {
        firstName: document.getElementById('player-first-name').value.trim(),
        lastName: document.getElementById('player-last-name').value.trim(),
        position: document.getElementById('player-position').value.trim(),
        // Number() — бо value з input завжди рядок, а сервер чекає число
        shirtNumber: Number(document.getElementById('player-number').value),
        teamId: Number(document.getElementById('player-team').value),
    };

    const response = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(newPlayer),
    });

    if (response.ok) {
        showMessage('player-message', 'Гравця додано!', false);
        // Якщо команда гравця не грає в обраному турнірі — перемикаємось на "Усі гравці",
        // щоб новий гравець одразу з'явився в таблиці
        const isParticipant = standingsList.some(row => row.teamId === newPlayer.teamId);
        if (!isParticipant) {
            setPlayersScope('all');
        }
        event.target.reset();
        await loadPlayers(); // перемальовуємо таблицю з новим гравцем
    } else {
        // Наприклад: "Номер 1 може мати тільки воротар" -> спливаюче вікно alert
        showError('player-message', await getErrorText(response));
    }
});

// Обробка форми імпорту гравців з CSV (POST /api/players/import)
document.getElementById('import-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const teamId = document.getElementById('import-team').value;
    // files — список обраних файлів; беремо перший (і єдиний)
    const file = document.getElementById('import-file').files[0];

    // FormData — "контейнер" для відправки форми з файлом (multipart/form-data).
    // Назви полів мають збігатися з параметрами ендпоінту: team_id і file
    const formData = new FormData();
    formData.append('team_id', teamId);
    formData.append('file', file);

    const response = await fetch('/api/players/import', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    });

    if (response.ok) {
        const result = await response.json(); // {"imported": 8, "teamId": 11}
        showMessage('import-message', 'Імпортовано гравців: ' + result.imported, false);
        event.target.reset();

        // Одразу показуємо в таблиці гравців саме тієї команди, куди імпортували.
        // Якщо ця команда не грає в обраному турнірі — перемикаємось на "Усі гравці",
        // інакше щойно імпортованих гравців не було б видно
        document.getElementById('players-filter').value = teamId;
        const isParticipant = standingsList.some(row => String(row.teamId) === teamId);
        if (!isParticipant) {
            setPlayersScope('all');
        }
        await loadPlayers();
    } else {
        // Наприклад: "Імпорт скасовано. Рядок 2: Номер 1 може мати тільки воротар"
        showError('import-message', await getErrorText(response));
    }
});

// Видалення гравця за id
async function deletePlayer(playerId) {
    // confirm — стандартне вікно браузера "OK / Скасувати"
    if (!confirm('Видалити цього гравця?')) {
        return;
    }

    const response = await fetch('/api/players/' + playerId, {
        method: 'DELETE',
        headers: authHeaders(),
    });

    if (response.ok) {
        showMessage('player-message', 'Гравця видалено', false);
        await loadPlayers();
    } else {
        showError('player-message', await getErrorText(response));
    }
}