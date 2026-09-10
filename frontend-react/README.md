# DropFix React frontend

Vite + React + Tailwind UI. Talks to the FastAPI backend via relative
`/api/*` URLs.

## Prerequisites

From the **repo root** (parent of `backend/` and `frontend-react/`):

1. Backend venv + deps (once):

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

2. This app's npm deps (once):

```bash
cd frontend-react && npm install
```

## Dev (recommended)

Terminal 1 — API on `:8000`:

```bash
# from repo root
backend/.venv/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — React on `:5173` (proxies `/api` and `/receipts` to `:8000`):

```bash
cd frontend-react && npm run dev
```

Open **http://127.0.0.1:5173**.

## Production-style (backend serves the React build)

```bash
cd frontend-react && npm run build
# from repo root:
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. FastAPI serves `frontend-react/dist` when
`index.html` is present there; otherwise this process is API-only (use
Vite for UI during development).
