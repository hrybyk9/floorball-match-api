from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import require_admin             
from app.models import Match, Tournament
from app.schemas import TournamentCreate, TournamentResponse, TournamentUpdate

router = APIRouter(prefix="/api/tournaments", tags=["Tournaments"])


async def check_name_is_free(db: AsyncSession, name: str, exclude_id: int | None = None):
    query = select(Tournament).where(Tournament.name == name)
    if exclude_id is not None:
        query = query.where(Tournament.id != exclude_id)

    result = await db.execute(query)
    # scalar_one_or_none() — повертає один знайдений об'єкт або None
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Турнір з такою назвою вже існує")


# GET /api/tournaments — список усіх турнірів
@router.get("/", response_model=list[TournamentResponse])
async def get_tournaments(db: AsyncSession = Depends(get_db)):
    # desc() — за спаданням: першим буде найновіший турнір
    query = select(Tournament).order_by(Tournament.start_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


# GET /api/tournaments/{id} — один турнір 
@router.get("/{tournament_id}", response_model=TournamentResponse)
async def get_tournament(tournament_id: int, db: AsyncSession = Depends(get_db)):
    tournament = await db.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Турнір не знайдено")
    return tournament


# POST /api/tournaments — створення турніру 
@router.post("/", response_model=TournamentResponse, status_code=201, dependencies=[Depends(require_admin)])
async def create_tournament(data: TournamentCreate, db: AsyncSession = Depends(get_db)):
    await check_name_is_free(db, data.name)

    new_tournament = Tournament(**data.model_dump())
    db.add(new_tournament)
    await db.commit()
    await db.refresh(new_tournament)
    return new_tournament


# PATCH /api/tournaments/{id} — редагування турніру
@router.patch("/{tournament_id}", response_model=TournamentResponse, dependencies=[Depends(require_admin)])
async def update_tournament(
    tournament_id: int,
    data: TournamentUpdate,
    db: AsyncSession = Depends(get_db),
):
    tournament = await db.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Турнір не знайдено")

    changes = data.model_dump(exclude_unset=True)

    if "name" in changes:
        await check_name_is_free(db, changes["name"], exclude_id=tournament_id)

    new_start = changes.get("start_date", tournament.start_date)
    new_end = changes.get("end_date", tournament.end_date)
    if new_end < new_start:
        raise HTTPException(
            status_code=400,
            detail="Дата завершення не може бути раніше за дату початку",
        )

    for field, value in changes.items():
        setattr(tournament, field, value)

    await db.commit()
    await db.refresh(tournament)
    return tournament


# DELETE /api/tournaments/{id} — видалення турніру
@router.delete("/{tournament_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_tournament(tournament_id: int, db: AsyncSession = Depends(get_db)):
    tournament = await db.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Турнір не знайдено")

    # SELECT COUNT(*) FROM matches WHERE tournament_id = ...
    count_query = select(func.count()).select_from(Match).where(
        Match.tournament_id == tournament_id
    )
    matches_count = (await db.execute(count_query)).scalar()

    # Турнір з матчами не видаляємо — інакше втратимо історію результатів
    if matches_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Неможливо видалити турнір, у якому є матчі ({matches_count})",
        )

    await db.delete(tournament)
    await db.commit()
    return None