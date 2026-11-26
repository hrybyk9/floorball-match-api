from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Match, Team, Tournament
from app.schemas import StandingRow  

router = APIRouter(prefix="/api/standings", tags=["Standings"])

POINTS_FOR_WIN = 3   
POINTS_FOR_DRAW = 1  
POINTS_FOR_LOSS = 0  


@router.get("/", response_model=list[StandingRow])
async def get_standings(
    # Запит /api/standings/ без ?tournament_id=... отримає помилку 422.
    tournament_id: int = Query(..., description="ID турніру, для якого рахуємо таблицю"),
    db: AsyncSession = Depends(get_db),
):
    tournament = await db.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Турнір не знайдено")

    matches_result = await db.execute(
        select(Match).where(Match.tournament_id == tournament_id)
    )
    tournament_matches = matches_result.scalars().all()

    participant_ids = set()
    for match in tournament_matches:
        participant_ids.add(match.home_team_id)
        participant_ids.add(match.away_team_id)

    if not participant_ids:
        return []

    teams_result = await db.execute(select(Team).where(Team.id.in_(participant_ids)))
    teams = teams_result.scalars().all()

    table = {}
    for team in teams:
        table[team.id] = {
            "position": 0,          # місце в таблиці (заповнимо після сортування)
            "team_id": team.id,
            "team_name": team.name,
            "played": 0,            # GP — зіграно матчів
            "wins": 0,              # W — перемоги
            "draws": 0,             # D — нічиї
            "losses": 0,            # L — поразки
            "goals_for": 0,         # GF — забиті голи
            "goals_against": 0,     # GA — пропущені голи
            "goal_difference": 0,   # GD — різниця голів (GF - GA)
            "points": 0,            # Points — очки
        }

    for match in tournament_matches:
        if match.status != "finished":
            continue

        if match.home_score is None or match.away_score is None:
            continue

        home = table.get(match.home_team_id) 
        away = table.get(match.away_team_id) 
        if home is None or away is None:
            continue  

        # Обидві команди зіграли ще один матч
        home["played"] += 1
        away["played"] += 1

        # Голи: забиті господарів = пропущені гостей, і навпаки
        home["goals_for"] += match.home_score
        home["goals_against"] += match.away_score
        away["goals_for"] += match.away_score
        away["goals_against"] += match.home_score

       
        if match.home_score > match.away_score:
            # Перемогли господарі
            home["wins"] += 1
            home["points"] += POINTS_FOR_WIN
            away["losses"] += 1
            away["points"] += POINTS_FOR_LOSS  
        elif match.home_score < match.away_score:
            # Перемогли гості
            away["wins"] += 1
            away["points"] += POINTS_FOR_WIN
            home["losses"] += 1
            home["points"] += POINTS_FOR_LOSS  
        else:
            # Нічия — обидві команди отримують по 1 очку
            home["draws"] += 1
            away["draws"] += 1
            home["points"] += POINTS_FOR_DRAW
            away["points"] += POINTS_FOR_DRAW

    rows = list(table.values())
    for row in rows:
        row["goal_difference"] = row["goals_for"] - row["goals_against"]

    rows.sort(
        key=lambda row: (row["points"], row["goal_difference"], row["goals_for"]),
        reverse=True,
    )

    for index, row in enumerate(rows, start=1):
        row["position"] = index

    return rows