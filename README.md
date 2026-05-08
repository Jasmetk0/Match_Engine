# Squash Match Lab

Squash Match Lab is a beginner-friendly local full-stack app for a fictional world where squash is a global top-3 sport. It includes player season profiles, Tour BO5 simulation, League Timed 3x5 simulation, saved matches, analytics, batch rivalry simulation, export/backup tools, and a Dashboard self-test.

## Project structure

```text
backend/            FastAPI app, SQLAlchemy models, simulation engines, API routers
frontend/           React + TypeScript + Vite app
data/               Local SQLite database folder
run_backend.bat     Windows backend setup/start script
run_frontend.bat    Windows frontend setup/start script
run_all_hint.txt    Short first-run checklist
```

The SQLite database is created locally at:

```text
data/squash_engine.db
```

Backups are written to:

```text
data/backups/
```

## Requirements

Install these on your Windows PC before running the app:

- Python 3.12
- Node.js with npm

No external services are required.

## First run on Windows

Open two Command Prompt or PowerShell windows from the project folder.

### 1. Start the backend

```bat
run_backend.bat
```

The backend script will:

1. Change into the project folder.
2. Create `backend\.venv` if it does not already exist.
3. Install backend packages from `backend\requirements.txt`.
4. Start FastAPI at `http://127.0.0.1:8000`.

Health check:

```text
http://127.0.0.1:8000/health
```

### 2. Start the frontend

```bat
run_frontend.bat
```

The frontend script will:

1. Change into `frontend`.
2. Install npm packages if `node_modules` is missing.
3. Start Vite at `http://127.0.0.1:5173`.

### 3. Open the app

Open this URL in your browser:

```text
http://127.0.0.1:5173
```

### 4. Run the self-test

On the Dashboard, use:

```text
Dashboard -> Dev Tools -> Run Self-Test
```

Then go to Match Lab, generate a match, and save one test match.

## Current MVP includes

- Players and season profiles with 18 attributes
- Controlled style/personality/mentality/progression dropdowns
- Elite sample players
- Tour BO5 match engine
- League Timed 3x5 match engine
- Monte Carlo previews
- Generate / Regenerate / Randomize Seed
- Save Match and Saved Matches page
- Analytics, H2H analytics, player history, and saved-match leaderboard
- Batch Simulate Rivalry
- Export app data JSON
- SQLite DB info, backup, clear saved matches, saved-match JSON import
- Backend self-test

## Local safety notes

- Use Dashboard -> Dev Tools -> Backup SQLite DB before risky manual testing.
- Clear saved matches deletes saved match history only. It does not delete players, season profiles, or sample players.
- Saved-match JSON import only imports historical saved matches. It does not import players or season profiles.
