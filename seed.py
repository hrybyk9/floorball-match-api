# Скрипт для автоматичного наповнення бази тестовими даними (Етапи 6–7).
# Запуск з кореня проєкту (там, де main.py):
#     python seed.py
# УВАГА: скрипт ПОВНІСТЮ видаляє і заново створює всі таблиці!

import asyncio
import random
from itertools import combinations
from datetime import date, datetime, timedelta
from sqlalchemy import insert, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.database import engine
from app.models import Base, Match, Player, Team, Tournament

random.seed(2026)

# 10 команд: (назва, місто, рік заснування)
TEAMS = [
    ("Lemberg", "Львів", 2009),
    ("Zhoda", "Львів", 2008),
    ("Skif", "Новий Розділ", 2011),
    ("Alliance", "Тернопіль", 2019),
    ("KFC", "Київ", 2007),
    ("Yantar", "Новояворівськ", 2010),
    ("Chosen", "Мукачево", 2016),
    ("SKY", "Рівне", 2023),
    ("Solva", "Свалява", 2019),
    ("Iceberg", "Луцьк", 2015),
]

# турніри — (назва, рік, дата початку, дата завершення, кількість команд-учасниць)
TOURNAMENTS = [
    ("Чемпіонат 2025", 2025, date(2025, 1, 15), date(2025, 5, 31), 10),  # усі 10 команд
    ("Кубок 2026", 2026, date(2026, 2, 1), date(2026, 4, 30), 6),        # 6 випадкових команд
    ("Чемпіонат 2026", 2026, date(2026, 9, 1), date(2026, 12, 20), 10),  # поточний сезон
]

# Можливий час початку матчів (години)
MATCH_HOURS = [12, 15, 18]

# Українські імена та прізвища — комбінуємо їх випадково
FIRST_NAMES = [
    "Андрій", "Олександр", "Дмитро", "Максим", "Богдан", "Іван", "Тарас",
    "Віталій", "Сергій", "Назар", "Остап", "Роман", "Юрій", "Владислав",
    "Микола", "Артем", "Денис", "Ярослав", "Євген", "Олег",
]
LAST_NAMES = [
    "Коваленко", "Шевченко", "Бондаренко", "Ткаченко", "Кравчук", "Мельник",
    "Олійник", "Савчук", "Гнатюк", "Литвиненко", "Семенюк", "Романюк",
    "Яремчук", "Зінченко", "Степаненко", "Сидорчук", "Маліновський",
    "Трубін", "Миколенко", "Кравець", "Бойко", "Петренко", "Федоренко",
    "Гончар", "Лисенко",
]

PLAYERS_PER_TEAM = 20
DEFENDERS_PER_TEAM = 7          # захисників у кожній команді


def generate_team_players(team_id: int) -> list[dict]:
    goalkeepers_count = random.randint(1, 3)  # Від 1 до 3 воротарів 
    forwards_count = PLAYERS_PER_TEAM - goalkeepers_count - DEFENDERS_PER_TEAM  # Решта: 7 захисників, інші — нападники
    positions = (
        ["Воротар"] * goalkeepers_count
        + ["Захисник"] * DEFENDERS_PER_TEAM
        + ["Нападник"] * forwards_count
    )

    # Номери воротарів: випадкові УНІКАЛЬНІ з 1..99 (номер 1 може випасти, а може й ні).
    gk_numbers = random.sample(range(1, 100), goalkeepers_count)

    # Номери польових гравців: випадкові УНІКАЛЬНІ числа 2..99, крім уже зайнятих воротарями.
    free_numbers = [n for n in range(2, 100) if n not in gk_numbers]
    field_numbers = random.sample(free_numbers, PLAYERS_PER_TEAM - goalkeepers_count)

    last_names = random.sample(LAST_NAMES, PLAYERS_PER_TEAM)

    numbers = sorted(gk_numbers) + sorted(field_numbers)

    players = []
    for i in range(PLAYERS_PER_TEAM):
        players.append({
            "first_name": random.choice(FIRST_NAMES),  # ім'я можуть повторюватись — це нормально
            "last_name": last_names[i],
            "position": positions[i],
            "shirt_number": numbers[i],
            "team_id": team_id,
        })
    return players


def generate_tournament_matches(tournament: Tournament, teams: list[Team]) -> list[dict]:
    pairs = list(combinations(teams, 2))
    random.shuffle(pairs)  # перемішуємо, щоб розклад не йшов "по алфавіту"

    total_days = (tournament.end_date - tournament.start_date).days
    now = datetime.now()  # потрібне, щоб визначити: матч уже зіграно чи ще ні

    matches = []
    for index, (team_a, team_b) in enumerate(pairs):
        if random.random() < 0.5:
            home, away = team_a, team_b
        else:
            home, away = team_b, team_a

        day_offset = index * total_days // len(pairs)
        match_day = tournament.start_date + timedelta(days=day_offset)
        match_date = datetime(
            match_day.year, match_day.month, match_day.day, random.choice(MATCH_HOURS)
        )

        if match_date < now:
            status = "finished"
            home_score = random.randint(0, 9)
            away_score = random.randint(0, 9)
        else:
            status = "scheduled"
            home_score = 0
            away_score = 0

        matches.append({
            "tournament_id": tournament.id,
            "home_team_id": home.id,
            "away_team_id": away.id,
            "date": match_date,
            "venue": f"Спорткомплекс, {home.city}",  # граємо в місті господарів
            "home_score": home_score,
            "away_score": away_score,
            "status": status,
        })
    return matches

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        tables = (
            f"{Match.__tablename__}, {Tournament.__tablename__}, "
            f"{Player.__tablename__}, {Team.__tablename__}"
        )
        await session.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))
        print("База очищена.")

        teams = [Team(name=n, city=c, founded_year=y) for n, c, y in TEAMS]
        session.add_all(teams)
        await session.flush()
        print(f"Додано команд: {len(teams)}")

        all_players = []
        for team in teams:
            all_players.extend(generate_team_players(team.id))

        await session.execute(insert(Player), all_players)
        print(f"Додано гравців: {len(all_players)}")

        tournaments = [
            Tournament(name=name, year=year, start_date=start, end_date=end)
            for name, year, start, end, _teams_count in TOURNAMENTS
        ]
        session.add_all(tournaments)
        await session.flush()  
        print(f"Додано турнірів: {len(tournaments)}")

        all_matches = []
        for tournament, settings in zip(tournaments, TOURNAMENTS):
            teams_count = settings[4]  
            participants = random.sample(teams, teams_count)
            tournament_matches = generate_tournament_matches(tournament, participants)
            all_matches.extend(tournament_matches)
            print(f"  {tournament.name}: {len(tournament_matches)} матчів")

        await session.execute(insert(Match), all_matches)
        print(f"Додано матчів: {len(all_matches)}")

        await session.commit()

    await engine.dispose()
    print("Готово! Можна запускати сервер: uvicorn main:app --reload")


if __name__ == "__main__":
    asyncio.run(main())