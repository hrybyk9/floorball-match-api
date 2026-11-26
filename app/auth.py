"""
   Відвідувач — не входить у систему. Може тільки ПЕРЕГЛЯДАТИ дані (GET-запити).
   Адміністратор — входить за логіном і паролем, які зберігаються на сервері
    у файлі .env . Після входу отримує токен і тільки
    з ним може створювати, змінювати й видаляти дані (POST / PATCH / DELETE).

"""

import secrets 

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Auth"])
active_tokens: set[str] = set()

bearer_scheme = HTTPBearer(auto_error=False)


# Pydantic-схеми для входу

class LoginRequest(BaseModel):
    """Тіло запиту на вхід: { "username": "admin", "password": "..." }"""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Відповідь після успішного входу: токен і роль"""
    token: str
    role: str


class RoleResponse(BaseModel):
    """Відповідь на питання "хто я?": admin або visitor"""
    role: str


# Перевірка прав (залежність)

async def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> None:
    if credentials is None or credentials.credentials not in active_tokens:
        raise HTTPException(
            # 401 Unauthorized — "сервер не знає, хто ви": потрібно увійти
            status_code=401,
            detail="Ця дія доступна лише адміністратору. Увійдіть у систему.",
        )


# Ендпоінти

# POST /api/auth/login — вхід адміністратора
@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest):
    if data.username != settings.ADMIN_USERNAME or data.password != settings.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=401,
            detail="Невірний логін або пароль",
        )

    # token_urlsafe(32) — випадковий рядок приблизно з 43 символів, вгадати його неможливо
    token = secrets.token_urlsafe(32)
    active_tokens.add(token)  # запам'ятовуємо, що цей токен дійсний
    return {"token": token, "role": "admin"}


# POST /api/auth/logout — вихід (токен перестає бути дійсним).
# Вийти може тільки той, хто увійшов, тому теж require_admin
@router.post("/logout", status_code=204, dependencies=[Depends(require_admin)])
async def logout(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    active_tokens.discard(credentials.credentials)
    return None


# GET /api/auth/me — "хто я?" Фронтенд питає це при завантаженні сторінки,
# щоб перевірити, чи збережений токен ще дійсний (наприклад, після перезапуску сервера)
@router.get("/me", response_model=RoleResponse)
async def who_am_i(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    if credentials is not None and credentials.credentials in active_tokens:
        return {"role": "admin"}
    return {"role": "visitor"}