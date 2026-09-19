#!/bin/bash
# Double-click to start DropFix and open the website.
# First click: one-time setup. Later clicks: start only (no reinstall).
# Keep the Terminal window open while you use the shop. Close it to stop.

set -e
cd "$(dirname "$0")"
ROOT="$PWD"
PORT=8001
URL="http://127.0.0.1:${PORT}"
PYTHON="$ROOT/backend/.venv/bin/python"
READY="$ROOT/backend/.setup_complete"
DIST="$ROOT/frontend-react/dist/index.html"

echo "========================================"
echo "  DropFix"
echo "========================================"
echo ""

need_setup=0
if [[ ! -x "$PYTHON" ]]; then need_setup=1; fi
if [[ ! -f "$DIST" ]]; then need_setup=1; fi
if [[ ! -f "$READY" ]]; then need_setup=1; fi

if [[ "$need_setup" -eq 1 ]]; then
  echo "First-time setup (only runs once)…"
  echo ""

  if [[ ! -x "$PYTHON" ]]; then
    echo "→ Creating Python environment…"
    python3 -m venv "$ROOT/backend/.venv"
    echo "→ Installing Python packages…"
    "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
  else
    echo "→ Python environment already exists — skipped."
  fi

  if [[ ! -f "$DIST" ]]; then
    echo "→ Building website…"
    if ! command -v npm >/dev/null 2>&1; then
      echo "ERROR: npm not found. Install Node.js, then run this again."
      read -r -p "Press Enter to close…"
      exit 1
    fi
    (cd "$ROOT/frontend-react" && npm install && npm run build)
  else
    echo "→ Website already built — skipped."
  fi

  date > "$READY"
  echo ""
  echo "Setup finished. Next time this will only start the app."
  echo ""
else
  echo "Already set up — starting only (no install / rebuild)."
  echo ""
fi

# Already running? Just open the browser
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Already running — opening browser."
  open "$URL"
  read -r -p "Press Enter to close this window…"
  exit 0
fi

# Open browser once the server answers
(
  for _ in $(seq 1 40); do
    if curl -sf "$URL" >/dev/null 2>&1; then
      open "$URL"
      exit 0
    fi
    sleep 0.4
  done
) &

echo "Opening $URL"
echo "Leave this window open. Close it to stop DropFix."
echo ""

cd "$ROOT"
exec "$PYTHON" -m uvicorn backend.main:app --host 127.0.0.1 --port "$PORT"
