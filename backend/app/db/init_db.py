from sqlalchemy import inspect, text

from app.core.config import DATA_DIR
from app.db.base import Base
from app.db.session import engine

# Import models here so SQLAlchemy registers them before create_all.
from app.models import player  # noqa: F401


def _migrate_minimal_player_table() -> None:
    """Upgrade the early local-dev players table without requiring migrations yet."""
    inspector = inspect(engine)
    if "players" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("players")}
    if {"nationality", "created_at", "updated_at"}.issubset(columns):
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE players RENAME TO players_legacy"))
        Base.metadata.create_all(bind=connection)
        connection.execute(
            text(
                """
                INSERT INTO players (id, name, nationality, handedness, popularity, leadership, created_at, updated_at)
                SELECT id, name, 'Unknown', COALESCE(handedness, 'right'), 50, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                FROM players_legacy
                """
            )
        )
        connection.execute(text("DROP TABLE players_legacy"))


def init_db() -> None:
    """Create local data directory and database tables if they do not exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _migrate_minimal_player_table()
    Base.metadata.create_all(bind=engine)
