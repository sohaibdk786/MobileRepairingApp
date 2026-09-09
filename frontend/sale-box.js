// Sale box on Home (spec section 5). Handles create, the multi-click
// lock, and the "same as last sale?" yes/no duplicate guard.
// Only runs on pages that actually have a #sale-form (i.e. Home).

(function () {
  const form = document.getElementById("sale-form");
  if (!form) return;

  const itemSelect = document.getElementById("sale-item");
  const customItemLabel = document.getElementById("sale-custom-item-label");
  const methodButtons = Array.from(document.querySelectorAll("#sale-method-row .btn-toggle"));
  const methodInput = document.getElementById("sale-method-input");
  const submitBtn = document.getElementById("sale-submit-btn");
  const confirmationEl = document.getElementById("sale-confirmation");
  const errorEl = document.getElementById("sale-error");

  // Same shop-history suggestions as the Repair box's Name field --
  // sales have no phone field, so there's nothing to wire up for that.
  attachSuggestions(form.querySelector('[name="name"]'), "/api/suggest/names");
  // Custom item box (shown when Item = Other): suggests past custom
  // items typed here before, same free-typing pattern as fault_other.
  attachSuggestions(form.querySelector('[name="custom_item"]'), "/api/suggest/sale-custom-items");

  async function loadItems() {
    const items = await api.get("/api/sale-items");
    itemSelect.innerHTML = "";
    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      itemSelect.appendChild(opt);
    }
  }

  function updateCustomItemVisibility() {
    customItemLabel.classList.toggle("hidden", itemSelect.value !== "Other");
  }

  function clearMethodSelection() {
    // Spec section 1, known problem #6: the OLD tool let Cash/Card carry
    // over from the previous sale if the button wasn't re-clicked. Force
    // a fresh, empty choice every time instead of ever defaulting one.
    methodButtons.forEach((btn) => btn.classList.remove("selected"));
    methodInput.value = "";
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

  async function submitSale(force) {
    if (submitBtn.disabled) return;
    if (!methodInput.value) {
      showError("Pick Cash or Card");
      return;
    }
    submitBtn.disabled = true;
    errorEl.classList.add("hidden");
    confirmationEl.classList.add("hidden");
    try {
      const payload = currentPayload(force);
      const data = await api.post("/api/sales", payload);
      if (data.duplicate) {
        handleDuplicate();
        return;
      }
      // Spec: fields stay after a save so a repeat customer buying a
      // second item doesn't need retyping. Cash/Card is the one
      // deliberate exception -- spec section 1, known problem #6 -- a
      // stale payment method carrying over from the last sale is exactly
      // the old tool's bug, so that one field always clears.
      clearMethodSelection();
      // The sale is saved either way from this point -- a print failure
      // must never look like the save itself failed.
      try {
        await printReceipt(`/api/sales/${data.sale.id}/print`);
        showConfirmation(`Saved and printed: ${data.sale.item} (${data.sale.price_display})`);
      } catch (printErr) {
        showConfirmation(
          `Saved sale: ${data.sale.item} (${data.sale.price_display}) -- but printing failed: ${printErr.message}. Use Reprint to try again.`
        );
      }
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  function handleDuplicate() {
    // Spec section 5: no "save without printing" middle option here --
    // a sale is either a genuine repeat (Yes) or an accidental
    // double-click (No), so only two choices.
    showModal({
      title: "Same as the last sale?",
      message: "This looks identical to the last saved sale. Print again?",
      buttons: [
        { label: "Yes -- genuine repeat sale", onClick: () => submitSale(true) },
        { label: "No -- that was a mistake", className: "secondary", onClick: () => {} },
      ],
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSale(false);
  });

  itemSelect.addEventListener("change", updateCustomItemVisibility);

  methodButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      methodButtons.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      methodInput.value = btn.dataset.value;
    });
  });

  // Exposed so Home's single Refresh button can clear this box.
  window.resetSaleBox = () => {
    form.reset();
    updateCustomItemVisibility();
    clearMethodSelection();
    confirmationEl.classList.add("hidden");
    errorEl.classList.add("hidden");
  };

  (async function init() {
    await loadItems();
    updateCustomItemVisibility();
  })();
})();
