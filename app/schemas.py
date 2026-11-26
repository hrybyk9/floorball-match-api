from datetime import datetime
from datetime import date as date_type
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Базова схема: поля в JSON пишуться у camelCase (homeTeamId)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# Team
class TeamCreate(CamelModel):
    name: str
    city: str
    founded_year: int

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Назва команди не може бути порожньою")
        return value

    @field_validator("founded_year")
    @classmethod
    def check_founded_year(cls, value: int) -> int:
        if value < 1900 or value > date_type.today().year:
            raise ValueError("Рік заснування має бути між 1900 і поточним роком")
        return value


class TeamUpdate(CamelModel):
    name: str | None = None
    city: str | None = None
    founded_year: int | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("Назва команди не може бути порожньою")
        return value

    @field_validator("founded_year")
    @classmethod
    def check_founded_year(cls, value: int | None) -> int | None:
        if value is not None and (value < 1900 or value > date_type.today().year):
            raise ValueError("Рік заснування має бути між 1900 і поточним роком")
        return value


class TeamResponse(TeamCreate):
    id: int


# Player
PlayerPosition = Literal["Воротар","Захисник","Нападник"]

class PlayerCreate(CamelModel):
    first_name: str
    last_name: str
    position: PlayerPosition
    shirt_number: int
    team_id: int

    @field_validator("shirt_number")
    @classmethod
    def check_shirt_number(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Номер гравця має бути більшим за 0")
        return value


class PlayerUpdate(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    position: PlayerPosition | None = None
    shirt_number: int | None = None
    team_id: int | None = None

    @field_validator("shirt_number")
    @classmethod
    def check_shirt_number(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError("Номер гравця має бути більшим за 0")
        return value


class PlayerResponse(PlayerCreate):
    id: int

# Tournament 
class TournamentCreate(CamelModel):
    """Тіло POST-запиту:
    { "name": "Кубок 2026", "year": 2026, "startDate": "2026-02-01", "endDate": "2026-06-30" }"""

    name: str
    year: int
    start_date: date_type  # у JSON: "startDate": "РРРР-ММ-ДД"
    end_date: date_type    # у JSON: "endDate": "РРРР-ММ-ДД"

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Назва турніру не може бути порожньою")
        return value

    @field_validator("year")
    @classmethod
    def check_year(cls, value: int) -> int:
        if value < 2000 or value > 2100:
            raise ValueError("Рік турніру має бути між 2000 і 2100")
        return value

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("Дата завершення не може бути раніше за дату початку")
        return self


class TournamentUpdate(CamelModel):
    """PATCH — часткове оновлення: усі поля необов'язкові."""

    name: str | None = None
    year: int | None = None
    start_date: date_type | None = None
    end_date: date_type | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("Назва турніру не може бути порожньою")
        return value

    @field_validator("year")
    @classmethod
    def check_year(cls, value: int | None) -> int | None:
        if value is not None and (value < 2000 or value > 2100):
            raise ValueError("Рік турніру має бути між 2000 і 2100")
        return value

    @model_validator(mode="after")
    def check_dates(self):
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("Дата завершення не може бути раніше за дату початку")
        return self


class TournamentResponse(TournamentCreate):

    id: int

# Match 
class MatchCreate(CamelModel):
    tournament_id: int
    home_team_id: int
    away_team_id: int
    date: datetime
    venue: str
    home_score: int = 0
    away_score: int = 0
    status: Literal["scheduled", "live", "finished"] = "scheduled"

    @field_validator("home_score", "away_score")
    @classmethod
    def check_score(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Рахунок не може бути від'ємним")
        return value

    @model_validator(mode="after")
    def check_teams(self):
        if self.home_team_id == self.away_team_id:
            raise ValueError("Команда не може грати сама проти себе")
        return self


class MatchUpdate(CamelModel):
    tournament_id: int | None = None
    home_team_id: int | None = None
    away_team_id: int | None = None
    date: datetime | None = None
    venue: str | None = None
    home_score: int | None = None
    away_score: int | None = None
    status: Literal["scheduled", "live", "finished"] | None = None

    @field_validator("home_score", "away_score")
    @classmethod
    def check_score(cls, value: int | None) -> int | None:
        if value is not None and value < 0:
            raise ValueError("Рахунок не може бути від'ємним")
        return value

    @model_validator(mode="after")
    def check_teams(self):
        if (
            self.home_team_id is not None
            and self.home_team_id == self.away_team_id
        ):
            raise ValueError("Команда не може грати сама проти себе")
        return self


class MatchResponse(MatchCreate):
    id: int

# Рахунок матчу (для PATCH /api/matches/{id}/score)
class MatchScoreUpdate(CamelModel):
    """Тіло PATCH-запиту: { "homeScore": 2, "awayScore": 1, "status": "finished" }"""
 
    home_score: int  
    away_score: int  
    status: Literal["scheduled", "live", "finished"] = "finished"
 
    @field_validator("home_score", "away_score")
    @classmethod
    def check_score(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Рахунок не може бути від'ємним")
        return value
 
 
# Рядок турнірної таблиці (для GET /api/standings) 
class StandingRow(CamelModel):
    position: int         # місце в таблиці
    team_id: int          # id команди
    team_name: str        # назва команди
    played: int           # GP — зіграно матчів
    wins: int             # W — перемоги
    draws: int            # D — нічиї
    losses: int           # L — поразки
    goals_for: int        # GF — забиті голи
    goals_against: int    # GA — пропущені голи
    goal_difference: int  # GD — різниця голів
    points: int           # Points — очки