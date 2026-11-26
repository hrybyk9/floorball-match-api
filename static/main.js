async function safeLoad(loadFunction) {
    try {
        await loadFunction();
    } catch (error) {
        // Текст помилки видно в браузері: F12 -> вкладка Console
        console.error(error);
    }
}

async function init() {
    await safeLoad(loadTeams);
    await safeLoad(loadTournaments);
    await safeLoad(loadPlayers);
    await safeLoad(loadMatches);
    await safeLoad(loadStandings);

    // Стартовий екран за правилом:
    // є хоч один турнір -> "Турнірна таблиця"; турнірів немає -> сторінка "Турніри"
    if (tournamentsList.length === 0) {
        showSection('tournaments');
    } else {
        showSection('standings');
    }
}

init();