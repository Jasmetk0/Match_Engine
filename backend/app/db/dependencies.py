from collections.abc import Generator

from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """Yield a database session for future API endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
