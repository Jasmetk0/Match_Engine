from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analytics import router as analytics_router
from app.api.dev import router as dev_router
from app.api.health import router as health_router
from app.api.match import router as match_router
from app.api.players import router as players_router
from app.api.saved_matches import router as saved_matches_router
from app.db.init_db import init_db
from app.metadata import APP_NAME, APP_VERSION


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize the local SQLite database when the API starts."""
    init_db()
    yield


app = FastAPI(
    title=f"{APP_NAME} API",
    description="Local API for squash match simulation experiments.",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(players_router)
app.include_router(match_router)
app.include_router(saved_matches_router)
app.include_router(analytics_router)
app.include_router(dev_router)
