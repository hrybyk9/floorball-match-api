import csv
import io

# APIRouter — "міні-додаток", який потім підключаємо в main.py
# Depends — механізм залежностей FastAPI (через нього отримуємо сесію БД)
# HTTPException — щоб повертати помилки (404, 400) клієнту
# status — зручні константи HTTP-кодів (status.HTTP_201_CREATED тощо)
from fastapi import APIRouter, Depends, HTTPException, status, File, Form, UploadFile

# ValidationError — помилка, яку кидає Pydantic, якщо дані не пройшли перевірку
from pydantic import ValidationError

from sqlalchemy import select, insert

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import require_admin             

from app.models import Player, Team

from app.schemas import PlayerCreate, PlayerResponse, PlayerUpdate


router = APIRouter(prefix="/api/players", tags=["Players"])


# Допоміжні функції 

async def get_player_or_404(player_id: int, db: AsyncSession) -> Player:
    """Шукає гравця за id. Якщо не знайдено — кидає помилку 404."""
    player = await db.get(Player, player_id)
    if player is None:
        # HTTPException одразу перериває виконання і повертає клієнту JSON з помилкою
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Гравця з id={player_id} не знайдено",
        )
    return player


async def check_team_exists(team_id: int, db: AsyncSession) -> None:
    """Перевіряє, що команда з таким id існує (інакше гравця не можна прив'язати)."""
    team = await db.get(Team, team_id)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Команду з id={team_id} не знайдено",
        )


GOALKEEPER_POSITION = "воротар"


def check_goalkeeper_number(position: str, shirt_number: int) -> None:
    # номер 1 може мати тільки воротар.
    # strip() прибирає пробіли по краях, lower() робить усі літери маленькими
    is_goalkeeper = position.strip().lower() == GOALKEEPER_POSITION

    if shirt_number == 1 and not is_goalkeeper:
        raise HTTPException(
            # 400 Bad Request — дані формально правильні, але порушують бізнес-правило
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Номер 1 може мати тільки воротар",
        )


async def check_number_is_free(
    team_id: int,
    shirt_number: int,
    db: AsyncSession,
    exclude_player_id: int | None = None,
) -> None:
    # SELECT * FROM players WHERE team_id = ... AND shirt_number = ...
    query = select(Player).where(
        Player.team_id == team_id,
        Player.shirt_number == shirt_number,
    )
    if exclude_player_id is not None:
        query = query.where(Player.id != exclude_player_id)

    result = await db.execute(query)
    if result.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Номер {shirt_number} вже зайнятий у цій команді",
        )

# GET /api/players — список гравців (з необов'язковим фільтром за командою)
@router.get("", response_model=list[PlayerResponse])
async def get_players(
    team_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    # Будуємо базовий запит: SELECT * FROM players ORDER BY id
    query = select(Player).order_by(Player.id)

    if team_id is not None:
        query = query.where(Player.team_id == team_id)
    result = await db.execute(query)
    return result.scalars().all()

# GET /api/players/{player_id} — один гравець за id
@router.get("/{player_id}", response_model=PlayerResponse)
async def get_player(player_id: int, db: AsyncSession = Depends(get_db)):
    return await get_player_or_404(player_id, db)

# POST /api/players — створення нового гравця
@router.post("", response_model=PlayerResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_player(data: PlayerCreate, db: AsyncSession = Depends(get_db)):
    await check_team_exists(data.team_id, db)
    check_goalkeeper_number(data.position, data.shirt_number)
    await check_number_is_free(data.team_id, data.shirt_number, db)

    new_player = Player(**data.model_dump())

    db.add(new_player)
    await db.commit()
    await db.refresh(new_player)

    return new_player


# POST /api/players/import — масовий імпорт гравців з CSV-файлу 
# Колонки, які обов'язково мають бути у файлі
CSV_COLUMNS = ["first_name", "last_name", "position", "shirt_number"]

def decode_csv_bytes(content: bytes) -> str:
    """Перетворює байти файлу в текст.

    Спершу пробуємо UTF-8 ("-sig" прибирає службовий символ BOM, який додає Excel),
    а якщо не вийшло — Windows-1251 (так Excel часто зберігає кирилицю).
    """
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("cp1251")


@router.post("/import", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def import_players(
    team_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Потрібен файл з розширенням .csv",
        )

    await check_team_exists(team_id, db)

    content = await file.read()
    text = decode_csv_bytes(content)

    first_line = text.split("\n", 1)[0]
    delimiter = ";" if ";" in first_line else ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    headers = [name.strip() for name in (reader.fieldnames or [])]
    missing = [col for col in CSV_COLUMNS if col not in headers]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У файлі бракує колонок: " + ", ".join(missing),
        )

    result = await db.execute(
        select(Player.shirt_number).where(Player.team_id == team_id)
    )
    used_numbers = set(result.scalars().all())  # set — швидка перевірка "чи є номер"

    new_rows = []  # сюди складаємо гравців, готових до вставки
    errors = []    # сюди — тексти помилок

    for line_number, row in enumerate(reader, start=2):
        row = {(k or "").strip(): (v or "").strip() for k, v in row.items()}

        if not any(row.values()):
            continue

        try:
            player_data = PlayerCreate.model_validate({
                "firstName": row["first_name"],
                "lastName": row["last_name"],
                "position": row["position"],
                "shirtNumber": row["shirt_number"], 
                "teamId": team_id,
            })
            check_goalkeeper_number(player_data.position, player_data.shirt_number)
        except ValidationError as e:
            first_error = e.errors()[0]
            field = first_error["loc"][0] if first_error["loc"] else "?"
            errors.append(f"Рядок {line_number} (поле {field}): {first_error['msg']}")
            continue
        except HTTPException as e:
            errors.append(f"Рядок {line_number}: {e.detail}")
            continue

        # Номер не повинен повторюватись у межах команди
        if player_data.shirt_number in used_numbers:
            errors.append(
                f"Рядок {line_number}: номер {player_data.shirt_number} вже зайнятий у команді"
            )
            continue
        used_numbers.add(player_data.shirt_number)

        new_rows.append(player_data.model_dump())

    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Імпорт скасовано. " + "; ".join(errors[:5]),
        )
    if not new_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл не містить жодного гравця",
        )

    await db.execute(insert(Player), new_rows)
    await db.commit()

    # Повертаємо коротку відповідь: скільки гравців додано
    return {"imported": len(new_rows), "teamId": team_id}


# PATCH /api/players/{player_id} — часткове оновлення
@router.patch("/{player_id}", response_model=PlayerResponse, dependencies=[Depends(require_admin)])
async def update_player(
    player_id: int,
    data: PlayerUpdate,
    db: AsyncSession = Depends(get_db),
):
    player = await get_player_or_404(player_id, db)
    update_data = data.model_dump(exclude_unset=True)

    if "team_id" in update_data:
        await check_team_exists(update_data["team_id"], db)

    new_position = update_data.get("position", player.position)
    new_shirt_number = update_data.get("shirt_number", player.shirt_number)
    check_goalkeeper_number(new_position, new_shirt_number)

    new_team_id = update_data.get("team_id", player.team_id)
    await check_number_is_free(new_team_id, new_shirt_number, db, exclude_player_id=player.id)

    for field, value in update_data.items():
        setattr(player, field, value)

    await db.commit()
    await db.refresh(player)
    return player


# DELETE /api/players/{player_id} — видалення гравця
# 204 No Content — стандартна відповідь на успішне видалення (без тіла)
@router.delete("/{player_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_player(player_id: int, db: AsyncSession = Depends(get_db)):
    player = await get_player_or_404(player_id, db)

    await db.delete(player)
    await db.commit()

    return None