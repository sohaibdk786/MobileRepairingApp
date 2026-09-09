// Loaded on every page: shows the TEST/LIVE mode banner, fills in the
// nav bar's brand name, and highlights the current page in the top nav.
// Depends on api.js being loaded first.

async function initCommonChrome() {
  const banner = document.getElementById("mode-banner");
  if (banner) {
    try {
      const status = await api.get("/api/status");
      const isLive = status.mode === "live";
      banner.textContent = isLive
        ? "LIVE MODE — real data"
        : "TEST MODE — fake data, safe to bang on";
      banner.classList.toggle("live", isLive);
      banner.classList.toggle("test", !isLive);
    } catch (err) {
      banner.textContent = "Could not reach the app server";
      banner.classList.add("live"); // red, as a caution state
    }
  }

  // The nav bar's title AND the browser tab title both follow the
  // shop's own name (Tools > Shop Details), not a hardcoded "DropFix" --
  // so renaming the shop there is the only step needed if the business
  // ever rebrands, no code change anywhere.
  //
  // The About page's "DropFix System" is deliberately left alone --
  // that names the SOFTWARE itself (built by, contact, version), a
  // different thing from which shop's data this install holds, the same
  // way installing "Square" or "Shopify POS" doesn't rename the app to
  // your shop's name. Renaming the shop shouldn't make that page lie
  // about what software it's describing.
  const brandLink = document.getElementById("brand-link");
  // Any "Price (£)" / "Amount (£)" style label wraps just its symbol in
  // <span class="currency-symbol">£</span> -- filled in here from
  // whatever's actually chosen in Tools > Shop Details, so those static
  // labels change along with every other £ in the app instead of being
  // the one place stuck showing £ regardless of the setting.
  const currencySymbolEls = document.querySelectorAll(".currency-symbol");
  if (brandLink || currencySymbolEls.length > 0) {
    try {
      const settings = await api.get("/api/tools/shop-settings");
      if (brandLink && settings.shop_name) {
        brandLink.textContent = settings.shop_name;
        // Page titles are "DropFix" or "DropFix - Search" etc. in the
        // static HTML -- swap just the leading "DropFix", keeping
        // whichever " - Screen" suffix that page already had.
        document.title = document.title.replace(/^DropFix/, settings.shop_name);
      }
      if (currencySymbolEls.length > 0) {
        const choices = await api.get("/api/currency-choices");
        const match = choices.find((c) => c.code === settings.currency_code);
        if (match) {
          currencySymbolEls.forEach((el) => { el.textContent = match.symbol; });
        }
      }
    } catch (err) {
      // keep the static fallback text/title/£
    }
  }

  const here = window.location.pathname;
  document.querySelectorAll("nav.topnav a").forEach((link) => {
    const href = link.getAttribute("href");
    // Exact match for most links; the Tools link also matches any of its
    // sub-pages (/tools/printer, /tools/backup, ...) so it stays
    // highlighted while browsing inside the Tools menu, not just on the
    // menu page itself.
    const isMatch = href === here || (href === "/tools" && here.startsWith("/tools/"));
    if (isMatch) {
      link.classList.add("current");
    }
  });
}

document.addEventListener("DOMContentLoaded", initCommonChrome);

// Small modal dialog used by the duplicate-guard prompts (Home) and
// confirm-delete (detail screen). Every page that uses it must include
// <div id="modal-root"></div> once in its body.
//
// buttons: [{ label, className, onClick }] -- onClick may be async; the
// modal always closes as soon as a button is clicked, before onClick runs.
function showModal({ title, message, buttons }) {
  const root = document.getElementById("modal-root");
  if (!root) return;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const box = document.createElement("div");
  box.className = "modal-box";

  const heading = document.createElement("h3");
  heading.textContent = title;
  box.appendChild(heading);

  if (message) {
    const p = document.createElement("p");
    p.textContent = message;
    box.appendChild(p);
  }

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  buttons.forEach((buttonDef) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = buttonDef.label;
    btn.className = buttonDef.className || "secondary";
    btn.addEventListener("click", async () => {
      overlay.remove();
      if (buttonDef.onClick) await buttonDef.onClick();
    });
    actions.appendChild(btn);
  });
  box.appendChild(actions);

  overlay.appendChild(box);
  root.appendChild(overlay);
}
