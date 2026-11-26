from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import models  
from app.database import Base, check_db_connection, engine

from fastapi.staticfiles import StaticFiles   
from fastapi.responses import FileResponse    
from app.routers import teams, players, matches, standings, tournaments
from app import auth                          

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not await check_db_connection():
        raise RuntimeError("Не вдалося підключитися до бази даних")

    # Створюємо таблиці teams, players, matches (якщо їх ще немає)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    # При зупинці сервера закриваємо з'єднання з БД
    await engine.dispose()


app = FastAPI(title="Sports Matches API", lifespan=lifespan)

app.include_router(teams.router)
app.include_router(players.router)
app.include_router(matches.router)
app.include_router(standings.router)
app.include_router(tournaments.router)
app.include_router(auth.router)   

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)  
async def index():
    return FileResponse("static/index.html")

@app.get("/health")
async def health():
    db_ok = await check_db_connection()
    return {"status": "ok", "database": "connected" if db_ok else "error"}