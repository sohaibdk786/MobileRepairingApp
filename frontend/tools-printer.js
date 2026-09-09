// Tools > Printer (spec section 11). Detection happens entirely in the
// browser via QZ Tray's own API (qz.printers.find() with no argument
// returns every printer Windows can see) -- the backend only ever stores
// whichever name gets picked ("no typing the name").

(function () {
  const detectBtn = document.getElementById("printer-detect-btn");
  if (!detectBtn) return; // not on this page

  const printerNameEl = document.getElementById("printer-current-name");
  const selectLabel = document.getElementById("printer-select-label");
  const select = document.getElementById("printer-select");
  const saveBtn = document.getElementById("printer-save-btn");
  const testBtn = document.getElementById("printer-test-btn");
  const confirmationEl = document.getElementById("printer-confirmation");
  const errorEl = document.getElementById("printer-error");

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    confirmationEl.classList.add("hidden");
  }

  function showConfirmation(message) {
    confirmationEl.textContent = message;
    confirmationEl.classList.remove("hidden");
    errorEl.classList.add("hidden");
  }

  async function loadCurrentPrinter() {
    const settings = await api.get("/api/tools/shop-settings");
    printerNameEl.textContent = settings.printer_name || "(none yet)";
  }

  detectBtn.addEventListener("click", async () => {
    detectBtn.disabled = true;
    errorEl.classList.add("hidden");
    try {
      await connectQz();
      const printers = await qz.printers.find();
      select.innerHTML = "";
      for (const name of printers) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }
      selectLabel.classList.remove("hidden");
      saveBtn.classList.remove("hidden");
    } catch (err) {
      showError(`Could not detect printers: ${err.message} -- is QZ Tray installed and running?`);
    } finally {
      detectBtn.disabled = false;
    }
  });

  saveBtn.addEventListener("click", async () => {
    if (!select.value) return;
    saveBtn.disabled = true;
    try {
      const settings = await api.put("/api/tools/printer", { printer_name: select.value });
      printerNameEl.textContent = settings.printer_name;
      showConfirmation(`Printer saved: ${settings.printer_name}`);
    } catch (err) {
      showError(err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    errorEl.classList.add("hidden");
    try {
      await printReceipt("/api/tools/test-print");
      showConfirmation("Test print sent.");
    } catch (err) {
      showError(err.message);
    } finally {
      testBtn.disabled = false;
    }
  });

  loadCurrentPrinter();
})();
