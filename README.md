# Squash Match Lab

Squash Match Lab is a beginner-friendly local full-stack app for building a squash match simulation workspace. This first version sets up the project structure, SQLite database, FastAPI backend, React/Vite frontend, and a Dashboard that checks whether the backend is reachable.

The rally-by-rally match engine is intentionally **not** implemented yet.

## Project structure

```text
backend/            FastAPI app, SQLAlchemy setup, and backend requirements
frontend/           React + TypeScript + Vite app
data/               Local SQLite database folder
README.md           Setup and run instructions
run_backend.bat     Windows script for backend setup and startup
run_frontend.bat    Windows script for frontend setup and startup
```

The SQLite database is created locally at:

```text
data/squash_engine.db
```

## Requirements

Install these on your Windows PC before running the app:

- Python 3.12
- Node.js with npm

No external services are required.

## Run on Windows

Open two Command Prompt or PowerShell windows from the project folder.

### 1. Start the backend

In the first window, run:

```bat
run_backend.bat
```

This script will:

1. Create `backend\.venv` if it does not already exist.
2. Install backend Python packages from `backend\requirements.txt`.
3. Start FastAPI with uvicorn at `http://127.0.0.1:8000`.
4. Create the local SQLite database and tables on startup.

You can check the API health endpoint at:

```text
http://127.0.0.1:8000/health
```

### 2. Start the frontend

In the second window, run:

```bat
run_frontend.bat
```

This script will:

1. Install npm packages in `frontend\node_modules` if needed.
2. Start the Vite development server.

Open the frontend in your browser at:

```text
http://127.0.0.1:5173
```

## What you should see

The app opens to a dark sports-tech Dashboard for Squash Match Lab. The Dashboard calls the backend `/health` endpoint and shows whether the FastAPI backend is connected.

Navigation placeholders are included for:

- Dashboard
- Players
- Match Lab
- Saved Matches

## Local development notes

- Backend code lives under `backend/app` and is split into API, core config, database, and model modules.
- SQLite foreign keys are enabled for every database connection.
- Frontend API calls are centralized in `frontend/src/services/api.ts`.
- Authentication and match simulation logic are intentionally omitted for now.
