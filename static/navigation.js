// navigation.js — перемикання розділів сайту і розгортання форм.
function showSection(name) {
    // Кожен розділ має id "section-<назва>": section-standings, section-matches...
    for (const section of document.querySelectorAll('.page-section')) {
        section.hidden = section.id !== 'section-' + name;
    }

    // Підсвічуємо пункт меню обраного розділу (квадратик / підкреслення на телефоні)
    for (const link of document.querySelectorAll('.nav-link')) {
        const isActive = link.dataset.go === name;
        link.classList.toggle('active', isActive);
        // aria-current — підказка для програм читання з екрана: "ви тут"
        if (isActive) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    }

    // Запам'ятовуємо поточний розділ в атрибуті <body data-section="...">.
    // CSS за ним ховає на телефоні блок "Наступна гра" всюди, крім таблиці
    document.body.dataset.section = name;
}

// Будь-який елемент з атрибутом data-go="назва" відкриває розділ.
// Так працюють: пункти меню, "змінити турнір" у шапці, "усі матчі турніру"
for (const element of document.querySelectorAll('[data-go]')) {
    element.addEventListener('click', () => showSection(element.dataset.go));
}

// Відкриває форму з id boxId і ховає кнопку, яка її відкриває
function openForm(boxId) {
    document.getElementById(boxId).classList.add('open');
    for (const button of document.querySelectorAll('[data-open-form="' + boxId + '"]')) {
        button.hidden = true;
    }
}

// Закриває форму і знову показує кнопку "+ Додати…"
function closeForm(boxId) {
    document.getElementById(boxId).classList.remove('open');
    for (const button of document.querySelectorAll('[data-open-form="' + boxId + '"]')) {
        button.hidden = false;
    }
}

// Кнопки "+ Додати матч", "+ Додати команду", "+ Новий турнір"...
for (const button of document.querySelectorAll('[data-open-form]')) {
    button.addEventListener('click', () => openForm(button.dataset.openForm));
}

// Кнопки "Скасувати" всередині таких форм
for (const button of document.querySelectorAll('[data-close-form]')) {
    button.addEventListener('click', () => closeForm(button.dataset.closeForm));
}