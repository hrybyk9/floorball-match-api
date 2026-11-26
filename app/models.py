from datetime import datetime
from datetime import date as date_type

from sqlalchemy import Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    city: Mapped[str] = mapped_column(String(100))
    founded_year: Mapped[int]

    players: Mapped[list["Player"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )
    home_matches: Mapped[list["Match"]] = relationship(
        back_populates="home_team", foreign_keys="Match.home_team_id"
    )
    away_matches: Mapped[list["Match"]] = relationship(
        back_populates="away_team", foreign_keys="Match.away_team_id"
    )


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(50))
    last_name: Mapped[str] = mapped_column(String(50))
    position: Mapped[str] = mapped_column(String(50))
    shirt_number: Mapped[int]
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))

    team: Mapped["Team"] = relationship(back_populates="players")

# Змагання / Турнір 
class Tournament(Base):
    """Одне змагання, наприклад «Чемпіонат 2025» чи «Кубок 2026».
    Кожен матч належить рівно одному турніру."""

    __tablename__ = "tournaments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    year: Mapped[int]  
    start_date: Mapped[date_type] = mapped_column(Date)
    end_date: Mapped[date_type] = mapped_column(Date)

    # Зв'язок "один до багатьох": один турнір -> багато матчів.
    matches: Mapped[list["Match"]] = relationship(back_populates="tournament")

class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    tournament_id: Mapped[int] = mapped_column(ForeignKey("tournaments.id"))
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    date: Mapped[datetime] = mapped_column(DateTime)
    venue: Mapped[str] = mapped_column(String(150))
    home_score: Mapped[int] = mapped_column(default=0)
    away_score: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    tournament: Mapped["Tournament"] = relationship(back_populates="matches")

    home_team: Mapped["Team"] = relationship(
        back_populates="home_matches", foreign_keys=[home_team_id]
    )
    away_team: Mapped["Team"] = relationship(
        back_populates="away_matches", foreign_keys=[away_team_id]
    )