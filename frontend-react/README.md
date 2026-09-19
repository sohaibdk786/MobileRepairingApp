# DropFix React frontend

Vite + React + Tailwind UI. Talks to the FastAPI backend via relative
`/api/*` URLs.

## Shop PC (recommended)

From the parent folder (`MobileRepairingApp/`):

| OS | Double-click |
|----|----------------|
| Windows | `Start DropFix.bat` |
| Mac | `Start DropFix.command` |

That builds the UI if needed, starts the API on **:8001**, and opens the
browser. Full Windows/Mac setup steps are in the root **README.md**.

## Prerequisites (developers)

From the **repo root** (parent of `backend/` and `frontend-react/`):

1. Backend venv + deps (once):

```bash
# Mac / Linux
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

# Windows
python -m venv backend\.venv
backend\.venv\Scripts\pip install -r backend\requirements.txt
```

2. Frontend deps (once):

```bash
cd frontend-react && npm install
```

## Dev (hot reload)

Terminal 1 — API on **:8001**:

```bash
# Mac / Linux (from repo root)
backend/.venv/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001

# Windows
backend\.venv\Scripts\python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

Terminal 2 — React on **:5173** (proxies `/api` etc. to `:8001`):

```bash
cd frontend-react && npm run dev
```

Open **http://127.0.0.1:5173**.

## Production-style (one process)

Backend serves the built React app:

```bash
cd frontend-react && npm run build

# Mac / Linux
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001

# Windows
backend\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

Open **http://127.0.0.1:8001**. FastAPI serves `frontend-react/dist` when
`index.html` is present; otherwise this process is API-only (use Vite for
UI during development).
