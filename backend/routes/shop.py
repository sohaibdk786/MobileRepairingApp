"""Public shop homepage for QR scans: mobiles for sale + contact details."""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from backend.core.database import get_connection
from backend.services.shop_public import get_public_shop

router = APIRouter(tags=["shop"])


@router.get("/api/shop")
def api_public_shop() -> dict:
    conn = get_connection()
    try:
        return get_public_shop(conn)
    finally:
        conn.close()


_SHOP_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Phones for sale</title>
<style>
  :root { --bg:#f5f5f7; --card:#fff; --text:#1d1d1f; --muted:#6e6e73; --ok:#34c759; --line:rgba(0,0,0,.08); }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:var(--bg); color:var(--text); min-height:100vh; }
  .wrap { width:100%; max-width:none; margin:0 auto; padding:1.5rem 1.5rem 2.5rem; }
  @media (min-width:640px) { .wrap { padding:2rem 3rem 3rem; } }
  .hero { background:var(--card); border:1px solid var(--line); border-radius:18px;
    box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.05); padding:1.35rem 1.25rem; margin-bottom:1.15rem; }
  .shop { font-size:1.35rem; font-weight:700; margin:0 0 .35rem; letter-spacing:-.02em; }
  .tag { display:inline-block; font-size:.72rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
    color:var(--ok); background:color-mix(in srgb, var(--ok) 14%, white); padding:.25rem .55rem; border-radius:999px; margin-bottom:.85rem; }
  .addr, .contact { color:var(--muted); margin:0; line-height:1.45; font-size:.95rem; }
  .contact { margin-top:.55rem; }
  .contact a { color:var(--text); font-weight:600; text-decoration:none; }
  .section { font-size:.72rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
    color:var(--muted); margin:0 0 .75rem; }
  .grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:.65rem; }
  @media (min-width:560px) { .grid { grid-template-columns:repeat(3, minmax(0, 1fr)); gap:.75rem; } }
  @media (min-width:820px) { .grid { grid-template-columns:repeat(4, minmax(0, 1fr)); gap:.85rem; } }
  @media (min-width:1100px) { .grid { grid-template-columns:repeat(5, minmax(0, 1fr)); gap:1rem; } }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden;
    box-shadow:0 1px 2px rgba(0,0,0,.03); display:flex; flex-direction:column; min-height:100%; }
  .media { position:relative; width:100%; aspect-ratio:1 / 1; background:#ececef; }
  .media img { width:100%; height:100%; object-fit:cover; display:block; }
  .media .placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center;
    color:var(--muted); font-size:.78rem; font-weight:500; }
  .dots { position:absolute; left:0; right:0; bottom:.45rem; display:flex; justify-content:center; gap:.28rem; }
  .dot { width:6px; height:6px; border-radius:999px; background:rgba(255,255,255,.55); box-shadow:0 0 0 1px rgba(0,0,0,.12); }
  .dot.on { background:#fff; }
  .body { padding:.8rem .85rem .95rem; display:flex; flex-direction:column; gap:.3rem; flex:1; }
  .model { font-weight:650; margin:0; font-size:.95rem; line-height:1.25;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:2.4em; }
  .price { font-weight:700; color:var(--ok); font-size:1.02rem; margin:0; }
  .notes { color:var(--muted); font-size:.8rem; margin:0; line-height:1.35;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .empty { color:var(--muted); background:var(--card); border:1px dashed var(--line); border-radius:14px; padding:1.1rem; text-align:center; grid-column:1 / -1; }
  .foot { text-align:center; color:var(--muted); font-size:.8rem; margin-top:1.5rem; }
</style>
</head>
<body>
<div class="wrap" id="root"><p class="addr">Loading shop…</p></div>
<script>
(async function () {
  const root = document.getElementById("root");
  try {
    const res = await fetch("/api/shop");
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed");
    const tel = (data.phone || "").replace(/\\s+/g, "");
    const phones = (data.phones || []).map(p => {
      const imgs = p.images || [];
      const cover = imgs[0] ? imgs[0].url : "";
      const dots = imgs.length > 1
        ? '<div class="dots">' + imgs.map((_, i) => '<span class="dot' + (i === 0 ? ' on' : '') + '"></span>').join("") + '</div>'
        : '';
      const media = cover
        ? '<div class="media"><img src="' + escapeHtml(cover) + '" alt="" loading="lazy"/>' + dots + '</div>'
        : '<div class="media"><div class="placeholder">No photo</div></div>';
      return '<article class="card">' + media +
        '<div class="body">' +
          '<p class="model">' + escapeHtml(p.model) + '</p>' +
          '<p class="price">' + escapeHtml(p.price_display) + '</p>' +
          (p.notes ? '<p class="notes">' + escapeHtml(p.notes) + '</p>' : '') +
        '</div></article>';
    }).join("") || '<div class="empty">No phones listed right now. Call the shop to ask what is in stock.</div>';
    root.innerHTML =
      '<div class="hero">' +
        '<div class="tag">Phones for sale</div>' +
        '<h1 class="shop">' + escapeHtml(data.shop_name) + '</h1>' +
        '<p class="addr">' + escapeHtml(data.address || "") + '</p>' +
        (data.phone
          ? '<p class="contact">Call / WhatsApp: <a href="tel:' + escapeHtml(tel) + '">' + escapeHtml(data.phone) + '</a></p>'
          : '') +
      '</div>' +
      '<div class="section">Available mobiles</div>' +
      '<div class="grid">' + phones + '</div>' +
      '<p class="foot">Visit us or call to reserve a phone.</p>';
    document.title = "Phones · " + data.shop_name;
  } catch (err) {
    root.innerHTML = '<div class="empty">Could not load the shop page. Please try again or call the shop.</div>';
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


@router.get("/shop", response_class=HTMLResponse)
def shop_page() -> HTMLResponse:
    return HTMLResponse(_SHOP_PAGE)
