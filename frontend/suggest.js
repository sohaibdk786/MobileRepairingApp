// Reusable "suggest from this shop's own past data" dropdown, attached
// to one text input at a time via attachSuggestions(inputEl, endpoint).
// Used to wire up Name (from /api/suggest/names) and Phone (from
// /api/suggest/phones) independently -- see app/suggestions.py. Depends
// on debounce() (util.js) and api (api.js), loaded before this file.

function attachSuggestions(inputEl, endpoint) {
  if (!inputEl) return;

  // The browser's own autofill memory is per-device and unreliable --
  // this dropdown replaces it with suggestions from the shop's actual
  // saved data, so it works the same on any till.
  inputEl.setAttribute("autocomplete", "off");
  inputEl.parentElement.style.position = "relative";

  const list = document.createElement("div");
  list.className = "suggest-list hidden";
  inputEl.insertAdjacentElement("afterend", list);

  function hide() {
    list.classList.add("hidden");
    list.innerHTML = "";
  }

  function render(items) {
    list.innerHTML = "";
    if (items.length === 0) {
      hide();
      return;
    }
    items.forEach((text) => {
      const row = document.createElement("div");
      row.className = "suggest-item";
      row.textContent = text;
      // mousedown (not click) fires before the input's blur below, so
      // the value is set before the dropdown closes on blur -- a plain
      // click handler here would lose the tap to the blur-triggered hide.
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        inputEl.value = text;
        hide();
      });
      list.appendChild(row);
    });
    list.classList.remove("hidden");
  }

  const runLookup = debounce(async () => {
    const q = inputEl.value.trim();
    if (!q) {
      hide();
      return;
    }
    try {
      const results = await api.get(`${endpoint}?q=${encodeURIComponent(q)}`);
      // Stale-response guard: the box may have changed again while this
      // request was in flight -- drop outdated results rather than
      // overwrite whatever's actually being typed now.
      if (inputEl.value.trim() === q) render(results);
    } catch (err) {
      hide();
    }
  }, 250);

  inputEl.addEventListener("input", runLookup);
  inputEl.addEventListener("focus", () => {
    if (inputEl.value.trim()) runLookup();
  });
  inputEl.addEventListener("blur", () => setTimeout(hide, 150));
}
