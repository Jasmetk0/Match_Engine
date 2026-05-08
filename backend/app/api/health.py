from fastapi import APIRouter

from app.core.config import DATABASE_PATH
from app.metadata import APP_NAME, APP_VERSION

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str | bool]:
    """Return a simple status payload for frontend connection checks."""
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
        "database_initialized": DATABASE_PATH.exists(),
    }
