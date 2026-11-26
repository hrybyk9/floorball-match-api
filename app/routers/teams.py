from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db          
from app.auth import require_admin       
from app.models import Team, Match       
from app.schemas import TeamCreate, TeamUpdate, TeamResponse


router = APIRouter(prefix="/api/teams", tags=["Teams"])


# Допоміжні функції 
async def get_team_or_404(team_id: int, db: AsyncSession) -> Team:
    """Шукає команду за id; якщо не знайшла — повертає помилку 404."""
    # select(Team).where(...) — це SQL: SELECT * FROM teams WHERE id = ...
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if team is None:
        # Зупиняємо виконання і віддаємо клієнту код 404
        raise HTTPException(status_code=404, detail="Команду не знайдено")
    return team


async def check_name_is_free(db: AsyncSession, name: str, exclude_id: int | None = None):
    query = select(Team).where(Team.name == name)
    if exclude_id is not None:
        query = query.where(Team.id != exclude_id)

    result = await db.execute(query)
    if result.scalar_one_or_none() is not None:
        # 400 Bad Request — запит неможливо виконати через стан даних
        raise HTTPException(status_code=400, detail="Команда з такою назвою вже існує")


# GET /api/teams — список усіх команд
@router.get("", response_model=list[TeamResponse])
async def get_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Team).order_by(Team.id))
    # scalars().all() перетворює рядки результату на список об'єктів Team
    return result.scalars().all()


# GET /api/teams/{id} — одна команда 
@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(team_id: int, db: AsyncSession = Depends(get_db)):
    return await get_team_or_404(team_id, db)


# POST /api/teams — створення команди 
@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_team(data: TeamCreate, db: AsyncSession = Depends(get_db)):
    await check_name_is_free(db, data.name)

    team = Team(**data.model_dump())
    db.add(team)                 
    await db.commit()            
    await db.refresh(team)       
    return team


# PATCH /api/teams/{id} — часткове оновлення 
@router.patch("/{team_id}", response_model=TeamResponse, dependencies=[Depends(require_admin)])
async def update_team(team_id: int, data: TeamUpdate, db: AsyncSession = Depends(get_db)):
    team = await get_team_or_404(team_id, db) 
    changes = data.model_dump(exclude_unset=True)

    if "name" in changes:
        await check_name_is_free(db, changes["name"], exclude_id=team_id)

    for field, value in changes.items():
        setattr(team, field, value)            
    await db.commit()                          
    await db.refresh(team)
    return team


# DELETE /api/teams/{id} — видалення команди 
@router.delete("/{team_id}", status_code=204, dependencies=[Depends(require_admin)])  # 204 No Content — успішно, тіло відповіді порожнє
async def delete_team(team_id: int, db: AsyncSession = Depends(get_db)):
    team = await db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Команду не знайдено")

    query = select(Match.id).where(
        or_(Match.home_team_id == team_id, Match.away_team_id == team_id)
    ).limit(1)
    result = await db.execute(query)
    if result.first() is not None:
        raise HTTPException(
            status_code=400,
            detail="Неможливо видалити команду, яка має матчі. Спочатку видаліть її матчі.",
        )

    await db.delete(team)
    await db.commit()
    return None