# Веб-система обліку матчів і результатів (флорбол)

Курсова робота з дисципліни «Веб-програмування на стороні сервера».
REST API на FastAPI + PostgreSQL і веб-сторінка на HTML/CSS/JavaScript.

Автор: Грибик Роксолана, група ФЕІ-25.

## Технології

- Python 3.13, FastAPI, Uvicorn
- SQLAlchemy 2.0 (асинхронно, драйвер asyncpg), Pydantic v2
- PostgreSQL 16 (запускається в Docker)
- Фронтенд: HTML, CSS, Vanilla JavaScript (без фреймворків)
- Тестування: Swagger (`/docs`), Postman

## Структура проєкту

```
floorball-match-api/
├── main.py                 # точка входу: підключення роутерів, static, /health
├── seed.py                 # наповнення бази тестовими даними
├── clear_db.py             # повне очищення бази
├── docker-compose.yml      # PostgreSQL 16
├── requirements.txt
├── env.example             # приклад файлу .env
├── postman_collection.json # колекція запитів Postman
├── app/
│   ├── config.py           # налаштування з .env
│   ├── database.py         # підключення до БД, сесії
│   ├── models.py           # таблиці: teams, players, tournaments, matches
│   ├── schemas.py          # Pydantic-схеми і валідація
│   ├── auth.py             # вхід адміністратора, перевірка прав (require_admin)
│   └── routers/            # teams, players, matches, tournaments, standings
└── static/                 # index.html, style.css, *.js
```

## Запуск (Windows)

1. Запустити Docker Desktop, потім базу даних:
   ```
   docker compose up -d
   ```
2. Створити файл `.env` на основі `env.example` і вписати свій пароль адміністратора.
3. Активувати віртуальне середовище і встановити залежності:
   ```
   venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. Наповнити базу тестовими даними (10 команд, 200 гравців, 3 турніри):
   ```
   python seed.py
   ```
5. Запустити сервер:
   ```
   uvicorn main:app --reload
   ```
6. Відкрити:
   - сайт — http://127.0.0.1:8000
   - документація API (Swagger) — http://127.0.0.1:8000/docs
   - перевірка роботи — http://127.0.0.1:8000/health

## Ролі

| Роль | Як потрапити | Що може |
|---|---|---|
| Відвідувач | без входу | переглядати таблицю, матчі, команди, гравців, турніри |
| Адміністратор | логін і пароль з `.env` | також створювати, змінювати й видаляти дані, імпортувати гравців з CSV |

Права перевіряє сервер: усі POST, PATCH і DELETE без токена адміністратора отримують відповідь 401.

## Основні ендпоінти

| Метод | URL | Доступ |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/logout`; GET `/api/auth/me` | усі / адмін / усі |
| GET | `/api/tournaments/`, `/api/teams`, `/api/players`, `/api/matches/` (+ `/{id}`) | усі |
| POST, PATCH, DELETE | ті самі ресурси | адмін |
| PATCH | `/api/matches/{id}/score` — внесення рахунку | адмін |
| POST | `/api/players/import` — імпорт гравців з CSV | адмін |
| GET | `/api/standings/?tournament_id=1` — турнірна таблиця | усі |

## Postman

Файл `postman_collection.json` імпортується в Postman (Import).
Спочатку виконати запит `Auth → login`: токен збережеться автоматично, і всі інші запити його використають.
