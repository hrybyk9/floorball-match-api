from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.DEBUG,       # логування SQL-запитів у режимі розробки
    pool_pre_ping=True,        # перевірка з'єднання перед використанням
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Базовий клас для всіх ORM-моделей (Team, Player, Match)."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency для FastAPI: видає сесію БД на час обробки запиту
    та гарантовано закриває її після завершення.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def check_db_connection() -> bool:
    """Допоміжна функція для перевірки з'єднання з БД під час старту сервера."""
    from sqlalchemy import text

    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        print(f"[DB CONNECTION ERROR] {exc}")
        return False