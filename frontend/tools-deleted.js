// Tools > Recently Deleted (spec section 9): restore a repair or sale
// deleted within the last 3 calendar days.

(function () {
  const repairsEl = document.getElementById("deleted-repairs");
  if (!repairsEl) return; // not on this page

  const salesEl = document.getElementById("deleted-sales");
  const emptyNote = document.getElementById("deleted-empty-note");
  const deleteAllBtn = document.getElementById("delete-all-btn");

  function makeDeletedRow(label, deletedAt, onRestore) {
    const row = document.createElement("div");
    row.className = "deleted-item";
    const labelSpan = document.createElement("span");
    labelSpan.innerHTML = `${escapeHtml(label)} <span class="hint">deleted ${escapeHtml(formatDateTime(deletedAt))}</span>`;
    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "small secondary";
    restoreBtn.textContent = "Restore";
    restoreBtn.addEventListener("click", async () => {
      restoreBtn.disabled = true;
      try {
        await onRestore();
        loadRecentlyDeleted();
      } catch (err) {
        restoreBtn.disabled = false;
      }
    });
    row.appendChild(labelSpan);
    row.appendChild(restoreBtn);
    return row;
  }

  async function loadRecentlyDeleted() {
    const data = await api.get("/api/tools/recently-deleted");
    repairsEl.innerHTML = "";
    salesEl.innerHTML = "";

    data.repairs.forEach((r) => {
      const label = `${r.ticket} · ${r.name} · ${r.model}`;
      repairsEl.appendChild(
        makeDeletedRow(label, r.deleted_at, () => api.post(`/api/repairs/${encodeURIComponent(r.ticket)}/restore`))
      );
    });

    data.sales.forEach((s) => {
      const label = `${s.item} · ${s.name}`;
      salesEl.appendChild(makeDeletedRow(label, s.deleted_at, () => api.post(`/api/sales/${s.id}/restore`)));
    });

    const total = data.repairs.length + data.sales.length;
    emptyNote.classList.toggle("hidden", total > 0);
    deleteAllBtn.classList.toggle("hidden", total === 0);
  }

  deleteAllBtn.addEventListener("click", () => {
    showModal({
      title: "Delete everything shown here?",
      message: "This permanently removes all of these repairs and sales right now, instead of waiting for the normal 3-day window. This cannot be undone.",
      buttons: [
        {
          label: "Yes, delete all",
          className: "danger",
          onClick: async () => {
            await api.post("/api/tools/recently-deleted/purge-all");
            loadRecentlyDeleted();
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  });

  loadRecentlyDeleted();
})();
