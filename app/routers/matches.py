from datetime import date as date_type  # тип "дата"; перейменовуємо, щоб не плутати з query-параметром date
from datetime import datetime
from typing import Optional              # Optional[X] означає "X або None" (необов'язковий параметр)

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func              # select — SELECT-запит, or_ — умова АБО, func — SQL-функції
from sqlalchemy.ext.asyncio import AsyncSession        # асинхронна сесія для роботи з БД

from app.database import get_db                        # залежність, яка видає сесію БД на кожен запит
from app.auth import require_admin              # перевірка: запит робить адміністратор 
from app.models import Match, Team, Tournament         # SQLAlchemy-моделі (таблиці matches, teams, tournaments)
from app.schemas import MatchCreate, MatchResponse, MatchScoreUpdate, MatchUpdate  # Pydantic-схеми для валідації

# Створюємо роутер: усі шляхи нижче автоматично починаються з /api/matches,
# а в Swagger ендпоінти будуть згруповані під заголовком "Matches"
router = APIRouter(prefix="/api/matches", tags=["Matches"])

#  Допоміжні функції 

async def get_tournament_or_404(db: AsyncSession, tournament_id: int) -> Tournament:
    """Шукає турнір за id. Якщо такого немає — повертає клієнту помилку 404."""
    tournament = await db.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Турнір не знайдено")
    return tournament


def check_date_in_tournament(match_date: datetime, tournament: Tournament):
    """Перевіряє, що дата матчу потрапляє в період турніру (від start_date до end_date).
    match_date.date() — відкидаємо час, щоб порівнювати дату з датою."""
    if not (tournament.start_date <= match_date.date() <= tournament.end_date):
        # strftime("%d.%m.%Y") — дата у звичному форматі: 01.09.2026
        start = tournament.start_date.strftime("%d.%m.%Y")
        end = tournament.end_date.strftime("%d.%m.%Y")
        raise HTTPException(
            status_code=400,
            detail=f"Дата матчу має бути в межах турніру «{tournament.name}»: з {start} по {end}",
        )


# GET /api/matches — список матчів з фільтрами 
@router.get("/", response_model=list[MatchResponse])
async def get_matches(
    # Усі параметри необов'язкові (за замовчуванням None), передаються в URL:
    # наприклад /api/matches/?tournament_id=2&team_id=1&status=finished
    tournament_id: Optional[int] = Query(None, description="ID турніру"), 
    team_id: Optional[int] = Query(None, description="ID команди (господарі або гості)"),
    status: Optional[str] = Query(None, description="Статус матчу: scheduled, live або finished"),
    date: Optional[date_type] = Query(None, description="Дата матчу у форматі РРРР-ММ-ДД"),
    db: AsyncSession = Depends(get_db),  # FastAPI сам підставить сесію БД
):
    # Починаємо з базового запиту: SELECT * FROM matches
    query = select(Match)

    # НОВЕ: якщо передано tournament_id — залишаємо лише матчі цього турніру
    if tournament_id is not None:
        query = query.where(Match.tournament_id == tournament_id)

    # Якщо передано team_id — залишаємо матчі, де команда грає вдома АБО в гостях
    if team_id is not None:
        query = query.where(
            or_(Match.home_team_id == team_id, Match.away_team_id == team_id)
        )

    # Якщо передано статус — фільтруємо за ним
    if status is not None:
        query = query.where(Match.status == status)

    # Якщо передано дату — порівнюємо тільки дату (без часу).
    # func.date(...) — це SQL-функція DATE(), яка відкидає години і хвилини
    if date is not None:
        query = query.where(func.date(Match.date) == date)

    # Сортуємо матчі за датою (від найближчих до пізніших)
    query = query.order_by(Match.date)

    # Виконуємо запит асинхронно (await) і отримуємо список об'єктів Match
    result = await db.execute(query)
    return result.scalars().all()


# GET /api/matches/{id} — один матч за ID
@router.get("/{match_id}", response_model=MatchResponse)
async def get_match(match_id: int, db: AsyncSession = Depends(get_db)):
    # db.get шукає запис за первинним ключем (id); якщо немає — поверне None
    match = await db.get(Match, match_id)
    if match is None:
        # 404 Not Found — стандартний HTTP-код "ресурс не знайдено"
        raise HTTPException(status_code=404, detail="Матч не знайдено")
    return match


# POST /api/matches — створення матчу
@router.post("/", response_model=MatchResponse, status_code=201, dependencies=[Depends(require_admin)])  # 201 Created — ресурс створено
async def create_match(match_data: MatchCreate, db: AsyncSession = Depends(get_db)):
    # НОВЕ: турнір має існувати, а дата матчу — потрапляти в його період
    tournament = await get_tournament_or_404(db, match_data.tournament_id)
    check_date_in_tournament(match_data.date, tournament)

    # Перевірка home_team_id != away_team_id вже виконується в схемі MatchCreate.
    # Тут додатково перевіряємо, що обидві команди справді існують у базі
    home_team = await db.get(Team, match_data.home_team_id)
    away_team = await db.get(Team, match_data.away_team_id)
    if home_team is None or away_team is None:
        raise HTTPException(status_code=404, detail="Команду-господаря або гостей не знайдено")

    # model_dump() перетворює Pydantic-об'єкт у словник з полями (tournament_id, home_team_id, ...),
    # а ** "розпаковує" словник в аргументи конструктора Match(...)
    new_match = Match(**match_data.model_dump())

    db.add(new_match)            # додаємо об'єкт у сесію (ще не в БД)
    await db.commit()            # зберігаємо зміни в БД (INSERT)
    await db.refresh(new_match)  # оновлюємо об'єкт даними з БД (з'являється id, status за замовчуванням)
    return new_match


# PATCH /api/matches/{id}/score — внесення рахунку 
@router.patch("/{match_id}/score", response_model=MatchResponse, dependencies=[Depends(require_admin)])
async def update_match_score(
    match_id: int,
    score_data: MatchScoreUpdate,  # тіло запиту: { "homeScore": 2, "awayScore": 1, "status": "finished" }
    db: AsyncSession = Depends(get_db),
):
    # Спочатку знаходимо матч
    match = await db.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Матч не знайдено")

    # PATCH означає часткове оновлення: змінюємо тільки рахунок і статус,
    # а команди, дата, місце і турнір залишаються без змін
    match.home_score = score_data.home_score
    match.away_score = score_data.away_score
    match.status = score_data.status

    await db.commit()        # зберігаємо зміни (UPDATE)
    await db.refresh(match)  # отримуємо актуальні дані з БД
    return match


# PATCH /api/matches/{id} — редагування матчу (турнір, команди, дата, місце) 
# Відрізняється від /score: тут змінюємо "розклад" матчу, а не його результат.
@router.patch("/{match_id}", response_model=MatchResponse, dependencies=[Depends(require_admin)])
async def update_match(
    match_id: int,
    match_data: MatchUpdate,  # тіло запиту, наприклад: { "venue": "Галичина", "date": "2026-11-08T18:00" }
    db: AsyncSession = Depends(get_db),
):
    # 1. Знаходимо матч, який редагуємо
    match = await db.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Матч не знайдено")

    # 2. exclude_unset=True — беремо тільки ті поля, які клієнт справді надіслав
    changes = match_data.model_dump(exclude_unset=True)

    # 3. Перевіряємо, що команда не грає сама з собою.
    #    Схема MatchUpdate перевіряє це, лише коли надіслано ОБИДВІ команди.
    #    Якщо надіслали тільки одну — порівнюємо її з тією, що вже записана в базі.
    #    dict.get(ключ, запасне_значення) — нове значення, якщо є, інакше старе
    new_home_id = changes.get("home_team_id", match.home_team_id)
    new_away_id = changes.get("away_team_id", match.away_team_id)
    if new_home_id == new_away_id:
        raise HTTPException(status_code=400, detail="Команда не може грати сама проти себе")

    # 4. Якщо змінюють команди — перевіряємо, що такі команди існують
    if "home_team_id" in changes or "away_team_id" in changes:
        home_team = await db.get(Team, new_home_id)
        away_team = await db.get(Team, new_away_id)
        if home_team is None or away_team is None:
            raise HTTPException(status_code=404, detail="Команду-господаря або гостей не знайдено")

    # 5. якщо змінюють турнір або дату — перевіряємо, що дата в межах турніру.
    if "tournament_id" in changes or "date" in changes:
        new_tournament_id = changes.get("tournament_id", match.tournament_id)
        new_date = changes.get("date", match.date)
        tournament = await get_tournament_or_404(db, new_tournament_id)
        check_date_in_tournament(new_date, tournament)

    # 6. Записуємо нові значення в об'єкт: setattr(match, "venue", "Арена") == match.venue = "Арена"
    for field, value in changes.items():
        setattr(match, field, value)

    await db.commit()        # зберігаємо зміни (UPDATE)
    await db.refresh(match)  # отримуємо актуальні дані з БД
    return match


# DELETE /api/matches/{id} — видалення матчу
@router.delete("/{match_id}", status_code=204, dependencies=[Depends(require_admin)])  # 204 No Content — успішно, але тіло відповіді порожнє
async def delete_match(match_id: int, db: AsyncSession = Depends(get_db)):
    match = await db.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Матч не знайдено")

    await db.delete(match)  # позначаємо об'єкт на видалення
    await db.commit()       # виконуємо DELETE в БД
    return None             # для коду 204 нічого не повертаємо