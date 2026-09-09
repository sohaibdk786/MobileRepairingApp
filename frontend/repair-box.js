// Repair box on Home (spec section 4). Handles create, the multi-click
// lock, and the "identical to last print" 3-choice duplicate guard.
// Only runs on pages that actually have a #repair-form (i.e. Home).

(function () {
  const form = document.getElementById("repair-form");
  if (!form) return;

  const faultSelect = document.getElementById("repair-fault");
  const faultOtherLabel = document.getElementById("repair-fault-other-label");
  const submitBtn = document.getElementById("repair-submit-btn");
  const confirmationEl = document.getElementById("repair-confirmation");
  const errorEl = document.getElementById("repair-error");

  // Suggests from this shop's own past repairs/sales as you type -- name
  // suggestions only ever come from past names, phone only from past
  // phone numbers, and picking one only fills that one box (see
  // app/suggestions.py).
  attachSuggestions(form.querySelector('[name="name"]'), "/api/suggest/names");
  attachSuggestions(form.querySelector('[name="phone"]'), "/api/suggest/phones");
  attachSuggestions(form.querySelector('[name="model"]'), "/api/suggest/models");
  // The "Other (describe)" box is a free-typed fault description, not a
  // fixed list -- suggests past custom descriptions instead of forcing a
  // dropdown-style pick, so anything typed before can be reused with a
  // tap but nothing is required to match it.
  attachSuggestions(form.querySelector('[name="fault_other"]'), "/api/suggest/fault-descriptions");

  async function loadFaultChoices() {
    const choices = await api.get("/api/fault-choices");
    faultSelect.innerHTML = "";
    for (const choice of choices) {
      const opt = document.createElement("option");
      opt.value = choice;
      opt.textContent = choice;
      faultSelect.appendChild(opt);
    }
  }

  function updateFaultOtherVisibility() {
    faultOtherLabel.classList.toggle("hidden", faultSelect.value !== "Other");
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    confirmationEl.classList.add("hidden");
  }

  function showConfirmation(text) {
    confirmationEl.textContent = text;
    confirmationEl.classList.remove("hidden");
    errorEl.classList.add("hidden");
  }

  function currentPayload(force) {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.force = !!force;
    return payload;
  }

  async function submitRepair(force) {
    // Multi-click lock (spec section 4): the button disables the instant
    // it's clicked, so rapid extra clicks can't fire a second save while
    // the first request is still in flight.
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    errorEl.classList.add("hidden");
    confirmationEl.classList.add("hidden");
    try {
      const payload = currentPayload(force);
      const data = await api.post("/api/repairs", payload);
      if (data.duplicate) {
        handleDuplicate(data.last_ticket);
        return;
      }
      // Spec section 4: "Fields stay after print. Nothing auto-clears.
      // Same customer with a second device can keep name/phone/passcode
      // and just change model and fault." -- the form is deliberately
      // NOT reset here. Only the Refresh button and the two duplicate-
      // guard choices that explicitly say "clear" ever touch the form.
      //
      // The ticket is saved either way from this point on -- a print
      // failure must never look like the save itself failed, so it gets
      // its own try/catch with its own message rather than bubbling up
      // to the generic error handler below.
      try {
        await printReceipt(`/api/repairs/${encodeURIComponent(data.ticket)}/print/intake`);
        showConfirmation(`Saved and printed ${data.ticket} (${data.price_display})`);
      } catch (printErr) {
        showConfirmation(
          `Saved as ${data.ticket} (${data.price_display}) -- but printing failed: ${printErr.message}. Use Reprint to try again.`
        );
      }
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  function handleDuplicate(lastTicket) {
    // Spec section 4: nothing typed differs from the last saved ticket
    // (auto date/time excluded). Ask what the user meant instead of
    // silently creating a click-jam duplicate or silently doing nothing.
    showModal({
      title: "Same as the last ticket?",
      message: `This looks identical to the last saved ticket (${lastTicket}). What do you want to do?`,
      buttons: [
        {
          label: "Reprint without saving",
          className: "secondary",
          onClick: async () => {
            form.reset();
            updateFaultOtherVisibility();
            try {
              await printReceipt(`/api/repairs/${encodeURIComponent(lastTicket)}/print/intake`);
              showConfirmation(`Reprinted ${lastTicket}. Nothing new saved.`);
            } catch (err) {
              showError(`Could not reprint ${lastTicket}: ${err.message}`);
            }
          },
        },
        {
          label: "Save as a new second ticket",
          onClick: () => submitRepair(true),
        },
        {
          label: "Clear the fields and do not save",
          className: "danger",
          onClick: () => {
            form.reset();
            updateFaultOtherVisibility();
          },
        },
      ],
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitRepair(false);
  });

  faultSelect.addEventListener("change", updateFaultOtherVisibility);

  // Exposed so Home's single Refresh button can clear this box (spec
  // section 3: "Cross-box safety" -- one instant clear-all, no confirm).
  window.resetRepairBox = () => {
    form.reset();
    updateFaultOtherVisibility();
    confirmationEl.classList.add("hidden");
    errorEl.classList.add("hidden");
  };

  (async function init() {
    await loadFaultChoices();
    updateFaultOtherVisibility();
  })();
})();
