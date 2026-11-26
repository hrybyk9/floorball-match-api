# Повністю очищає базу: видаляє ВСІ матчі, турніри, гравців і команди.
# Запуск з кореня проєкту (там, де main.py):
#     python clear_db.py

import asyncio

from sqlalchemy import text
from app.database import engine
from app.models import Match, Player, Team, Tournament

async def main():
    answer = input("Видалити ВСІ команди, гравців, турніри і матчі? Введіть 'так': ")
    if answer.strip().lower() != "так":
        print("Скасовано. Нічого не видалено.")
        return

    async with engine.begin() as conn:
        tables = (
            f"{Match.__tablename__}, {Tournament.__tablename__}, "
            f"{Player.__tablename__}, {Team.__tablename__}"
        )
        await conn.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))

    # Закриваємо всі з'єднання з БД
    await engine.dispose()
    print("Базу очищено. Тепер можна додавати власні записи (почніть з турніру).")

if __name__ == "__main__":
    asyncio.run(main())