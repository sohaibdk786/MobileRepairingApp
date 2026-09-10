"""Public customer tracking: JSON API + standalone HTML page for QR scans."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from backend.core.database import get_connection
from backend.services.tracking import get_public_repair_status

router = APIRouter(tags=["tracking"])


@router.get("/api/track/{token}")
def api_track_status(token: str) -> dict:
    conn = get_connection()
    try:
        data = get_public_repair_status(conn, token)
    finally:
        conn.close()
    if data is None:
        raise HTTPException(404, "Tracking link not found or no longer available")
    return data


_TRACK_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Repair status</title>
<style>
  :root { --bg:#f5f5f7; --card:#fff; --text:#1d1d1f; --muted:#6e6e73; --ok:#34c759; --line:rgba(0,0,0,.08); }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:var(--bg); color:var(--text); min-height:100vh; }
  .wrap { max-width:420px; margin:0 auto; padding:1.25rem; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px;
    box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.05); padding:1.25rem; }
  h1 { font-size:1.15rem; margin:0 0 .25rem; }
  .shop { color:var(--muted); font-size:.9rem; margin:0 0 1.25rem; }
  .steps { display:flex; gap:.35rem; margin:0 0 1.25rem; }
  .step { flex:1; height:6px; border-radius:999px; background:#e5e5ea; }
  .step.on { background:var(--ok); }
  .status { font-size:1.35rem; font-weight:700; margin:0 0 .35rem; }
  .detail { color:var(--muted); margin:0 0 1.25rem; line-height:1.4; }
  .meta { display:grid; gap:.65rem; margin-bottom:1.25rem; }
  .row { display:flex; justify-content:space-between; gap:1rem; font-size:.92rem; }
  .row span:first-child { color:var(--muted); }
  .section { font-size:.72rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
    color:var(--muted); margin:0 0 .5rem; }
  .fault { padding:.55rem 0; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:.75rem; font-size:.92rem; }
  .fault:last-child { border-bottom:0; }
  .err { background:#fff1f0; color:#c60f02; padding:.85rem 1rem; border-radius:12px; }
  .foot { text-align:center; color:var(--muted); font-size:.8rem; margin-top:1.25rem; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card" id="root"><p class="detail">Loading your repair status…</p></div>
  <p class="foot" id="foot"></p>
</div>
<script>
(async function () {
  const root = document.getElementById("root");
  const token = location.pathname.split("/").filter(Boolean).pop();
  try {
    const res = await fetch("/api/track/" + encodeURIComponent(token));
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Not found");
    const step = Math.min(Math.max(data.journey_step || 1, 1), 4);
    const steps = [1,2,3,4].map(n => '<div class="step' + (n <= step ? ' on' : '') + '"></div>').join("");
    const faults = (data.faults || []).map(f =>
      '<div class="fault"><span>' + escapeHtml(f.description) + '</span><span>' + escapeHtml(f.price_display) + '</span></div>'
    ).join("") || '<div class="fault"><span>Details with the shop</span><span></span></div>';
    root.innerHTML =
      '<p class="shop">' + escapeHtml(data.shop_name) + '</p>' +
      '<h1>Hello' + (data.customer_first_name ? ', ' + escapeHtml(data.customer_first_name) : '') + '</h1>' +
      '<div class="steps">' + steps + '</div>' +
      '<p class="status">' + escapeHtml(data.status_title) + '</p>' +
      '<p class="detail">' + escapeHtml(data.status_detail) + '</p>' +
      '<div class="meta">' +
        '<div class="row"><span>Ticket</span><strong>' + escapeHtml(data.ticket) + '</strong></div>' +
        '<div class="row"><span>Device</span><strong>' + escapeHtml(data.model) + '</strong></div>' +
        '<div class="row"><span>Total</span><strong>' + escapeHtml(data.total_display || "Pending") + '</strong></div>' +
        (data.balance_display ? '<div class="row"><span>Balance</span><strong>' + escapeHtml(data.balance_display) + '</strong></div>' : '') +
      '</div>' +
      '<div class="section">What we\\'re fixing</div>' + faults;
    document.getElementById("foot").textContent =
      data.shop_phone ? ("Questions? Call " + data.shop_phone) : "";
    document.title = data.status_title + " · " + data.shop_name;
  } catch (err) {
    root.innerHTML = '<div class="err">This tracking link is invalid or expired. Please contact the shop with your ticket number.</div>';
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }
})();
</script>
</body>
</html>
"""


@router.get("/track/{token}", response_class=HTMLResponse)
def track_page(token: str) -> HTMLResponse:
    # Lightweight standalone page so a phone scanning the receipt QR works
    # even without the React app -- it only needs this server reachable.
    return HTMLResponse(_TRACK_PAGE)
