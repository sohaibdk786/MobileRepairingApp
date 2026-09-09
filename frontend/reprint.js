// Reprint screen (spec section 8): the 3 quick buttons print immediately
// -- no detour through the detail screen, since the whole point of this
// screen (as opposed to Search) is getting another copy of something
// fast. The embedded search bar below them is handled entirely by
// search.js, loaded alongside this file on the same page, and behaves
// exactly like the main Search screen (click a row -> its detail view),
// since browsing older tickets is a "look before you reprint" flow.

(function () {
  const lastRepairBtn = document.getElementById("last-repair-btn");
  if (!lastRepairBtn) return; // not on the Reprint page

  function wireQuickButton({ lookupUrl, noteEl, btn, describe, printUrl }) {
    api
      .get(lookupUrl)
      .then((data) => {
        noteEl.textContent = describe(data);
        btn.disabled = false;
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          const originalNote = noteEl.textContent;
          noteEl.textContent = "Printing...";
          try {
            await printReceipt(printUrl(data));
            noteEl.textContent = originalNote;
          } catch (err) {
            noteEl.textContent = `Could not print: ${err.message}`;
          } finally {
            btn.disabled = false;
          }
        });
      })
      .catch(() => {
        noteEl.textContent = "None yet";
      });
  }

  wireQuickButton({
    lookupUrl: "/api/reprint/last-repair",
    noteEl: document.getElementById("last-repair-note"),
    btn: lastRepairBtn,
    describe: (r) => `${r.ticket} · ${r.name} · ${r.model}`,
    printUrl: (r) => `/api/repairs/${encodeURIComponent(r.ticket)}/print/intake`,
  });

  wireQuickButton({
    lookupUrl: "/api/reprint/last-sale",
    noteEl: document.getElementById("last-sale-note"),
    btn: document.getElementById("last-sale-btn"),
    describe: (s) => `${s.item} · ${s.name}`,
    printUrl: (s) => `/api/sales/${s.id}/print`,
  });

  wireQuickButton({
    lookupUrl: "/api/reprint/last-collection",
    noteEl: document.getElementById("last-collection-note"),
    btn: document.getElementById("last-collection-btn"),
    describe: (r) => `${r.ticket} · ${r.name} · ${r.model}`,
    printUrl: (r) => `/api/repairs/${encodeURIComponent(r.ticket)}/print/collection`,
  });
})();
