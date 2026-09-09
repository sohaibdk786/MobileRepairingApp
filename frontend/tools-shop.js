// Tools > Shop Details (spec section 10/11): the editable shop content
// that prints on every receipt. Plain edit and save, no confirm step.

(function () {
  const settingsForm = document.getElementById("shop-settings-form");
  if (!settingsForm) return; // not on this page

  const confirmationEl = document.getElementById("shop-settings-confirmation");
  const errorEl = document.getElementById("shop-settings-error");
  const currencySelect = document.getElementById("currency-code-select");
  const printStyleButtons = Array.from(document.querySelectorAll("#currency-print-style-row .btn-toggle"));
  const printStyleInput = document.getElementById("currency-print-style-input");

  // Populated from the server's own list (app/constants.py) rather than
  // hardcoded here, so the two can never drift apart.
  async function loadCurrencyChoices() {
    const choices = await api.get("/api/currency-choices");
    currencySelect.innerHTML = "";
    for (const { code, symbol } of choices) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = `${symbol} — ${code}`;
      currencySelect.appendChild(opt);
    }
  }

  function setPrintStyle(style) {
    printStyleInput.value = style;
    printStyleButtons.forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === style));
  }

  printStyleButtons.forEach((btn) => {
    btn.addEventListener("click", () => setPrintStyle(btn.dataset.value));
  });

  async function loadShopSettings() {
    const settings = await api.get("/api/tools/shop-settings");
    for (const [key, value] of Object.entries(settings)) {
      const field = settingsForm.elements.namedItem(key);
      if (field) field.value = value;
    }
    // Falls back to "sign" if this is ever missing/blank, so one of the
    // two buttons is always visibly selected rather than neither.
    setPrintStyle(settings.currency_print_style || "sign");
  }

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    confirmationEl.classList.add("hidden");
    errorEl.classList.add("hidden");
    const formData = new FormData(settingsForm);
    const payload = Object.fromEntries(formData.entries());
    payload.warranty_days = parseInt(payload.warranty_days, 10) || 0;
    try {
      await api.put("/api/tools/shop-settings", payload);
      confirmationEl.textContent = "Saved.";
      confirmationEl.classList.remove("hidden");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
    }
  });

  // Options must exist before the select's value is set, or the saved
  // currency would silently fail to show as selected.
  (async function init() {
    await loadCurrencyChoices();
    await loadShopSettings();
  })();
})();
