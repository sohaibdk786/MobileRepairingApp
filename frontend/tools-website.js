// Tools > Shop Website: embeds whichever Google Form is currently saved
// in Tools > Shop Details (website_form_url) -- never hardcoded here, so
// the shop can point this at a new form themselves without needing a
// code change (spec section 11's "editable, not hardcoded" rule applied
// to this field too).

(function () {
  const frame = document.getElementById("website-form-frame");
  if (!frame) return; // not on this page

  const missingEl = document.getElementById("website-form-missing");

  (async function init() {
    const settings = await api.get("/api/tools/shop-settings");
    const rawUrl = (settings.website_form_url || "").trim();
    if (!rawUrl) {
      missingEl.classList.remove("hidden");
      return;
    }
    // Google's own iframe-embed convention is `?embedded=true` -- built
    // via URL() rather than string concatenation so this works whether
    // the saved link already carries its own query params (e.g. a
    // "?usp=sharing" share link pasted as-is) or not.
    let embedUrl;
    try {
      const url = new URL(rawUrl);
      url.searchParams.set("embedded", "true");
      embedUrl = url.toString();
    } catch (err) {
      missingEl.textContent = "The saved form link doesn't look like a valid URL -- check it in Tools > Shop Details.";
      missingEl.classList.remove("hidden");
      return;
    }
    frame.src = embedUrl;
    frame.classList.remove("hidden");
  })();
})();
