// Tools > Backup & Restore (spec section 10). Manual backup, both
// restore paths, CSV export.

(function () {
  const backupBtn = document.getElementById("backup-now-btn");
  if (!backupBtn) return; // not on this page

  const lastBackupEl = document.getElementById("last-backup-time");
  const backupConfirmationEl = document.getElementById("backup-confirmation");
  const backupErrorEl = document.getElementById("backup-error");

  async function loadLastBackupTime() {
    const status = await api.get("/api/cloud/status");
    lastBackupEl.textContent = status.last_backup_at ? formatDateTime(status.last_backup_at) : "Never";
  }

  backupBtn.addEventListener("click", async () => {
    backupBtn.disabled = true;
    backupErrorEl.classList.add("hidden");
    backupConfirmationEl.classList.add("hidden");
    try {
      const result = await api.post("/api/cloud/backup-now");
      backupConfirmationEl.textContent = result.message;
      backupConfirmationEl.classList.remove("hidden");
      await loadLastBackupTime();
    } catch (err) {
      backupErrorEl.textContent = err.message;
      backupErrorEl.classList.remove("hidden");
    } finally {
      backupBtn.disabled = false;
    }
  });

  // ---- Restore from .db upload ----

  const dbFileInput = document.getElementById("db-restore-input");
  const dbRestoreBtn = document.getElementById("db-restore-btn");
  const dbConfirmationEl = document.getElementById("db-restore-confirmation");
  const dbErrorEl = document.getElementById("db-restore-error");

  dbRestoreBtn.addEventListener("click", () => {
    const file = dbFileInput.files[0];
    if (!file) {
      dbErrorEl.textContent = "Choose a .db file first";
      dbErrorEl.classList.remove("hidden");
      return;
    }
    showModal({
      title: "Replace the current database?",
      message: "The current database is kept as a timestamped backup file first, but everything saved after that point will no longer be what's active. This cannot be undone from here.",
      buttons: [
        {
          label: "Replace it",
          className: "danger",
          onClick: async () => {
            dbRestoreBtn.disabled = true;
            dbErrorEl.classList.add("hidden");
            try {
              const formData = new FormData();
              formData.append("file", file);
              const res = await fetch("/api/cloud/restore/db", { method: "POST", body: formData });
              const data = await res.json();
              if (!res.ok) throw new Error(data.detail || "Restore failed");
              dbConfirmationEl.textContent = data.message;
              dbConfirmationEl.classList.remove("hidden");
            } catch (err) {
              dbErrorEl.textContent = err.message;
              dbErrorEl.classList.remove("hidden");
            } finally {
              dbRestoreBtn.disabled = false;
            }
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  });

  // ---- Import from Sheet ----

  const sheetInput = document.getElementById("sheet-import-input");
  const sheetImportBtn = document.getElementById("sheet-import-btn");
  const sheetConfirmationEl = document.getElementById("sheet-import-confirmation");
  const sheetErrorEl = document.getElementById("sheet-import-error");

  sheetImportBtn.addEventListener("click", async () => {
    const sheetId = sheetInput.value.trim();
    if (!sheetId) {
      sheetErrorEl.textContent = "Enter a Sheet ID first";
      sheetErrorEl.classList.remove("hidden");
      return;
    }
    sheetImportBtn.disabled = true;
    sheetErrorEl.classList.add("hidden");
    sheetConfirmationEl.classList.add("hidden");
    try {
      const result = await api.post("/api/cloud/restore/sheet", { sheet_id: sheetId });
      sheetConfirmationEl.textContent = result.message;
      sheetConfirmationEl.classList.remove("hidden");
    } catch (err) {
      sheetErrorEl.textContent = err.message;
      sheetErrorEl.classList.remove("hidden");
    } finally {
      sheetImportBtn.disabled = false;
    }
  });

  loadLastBackupTime();
})();
