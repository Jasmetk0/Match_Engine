from app.core.config import DATA_DIR
from app.db.base import Base
from app.db.session import engine

# Import models here so SQLAlchemy registers them before create_all.
from app.models import player  # noqa: F401


def init_db() -> None:
    """Create local data directory and database tables if they do not exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
