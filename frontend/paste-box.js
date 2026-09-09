// Paste & Print box on Home (spec section 6): pure passthrough, no
// saving. Only runs on pages that actually have #voucher-text (Home).

(function () {
  const textarea = document.getElementById("voucher-text");
  if (!textarea) return;

  const printBtn = document.getElementById("voucher-print-btn");
  const confirmationEl = document.getElementById("voucher-confirmation");
  const errorEl = document.getElementById("voucher-error");

  printBtn.addEventListener("click", async () => {
    if (printBtn.disabled) return; // multi-click lock, same rule as Repair/Sale
    const text = textarea.value;
    if (!text.trim()) {
      errorEl.textContent = "Paste some text first";
      errorEl.classList.remove("hidden");
      confirmationEl.classList.add("hidden");
      return;
    }
    printBtn.disabled = true;
    errorEl.classList.add("hidden");
    confirmationEl.classList.add("hidden");
    try {
      const payload = await api.post("/api/paste-print", { text });
      await deliverReceipt(payload);
      confirmationEl.textContent = "Printed.";
      confirmationEl.classList.remove("hidden");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
    } finally {
      printBtn.disabled = false;
    }
  });

  // Exposed so Home's single Refresh button can clear this box.
  window.resetPasteBox = () => {
    textarea.value = "";
    confirmationEl.classList.add("hidden");
    errorEl.classList.add("hidden");
  };
})();
