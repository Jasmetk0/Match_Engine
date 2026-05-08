from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Return a simple status payload for frontend connection checks."""
    return {
        "status": "ok",
        "app": "Squash Match Lab",
    }
