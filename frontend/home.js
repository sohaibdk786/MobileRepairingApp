// Home page glue: the single Refresh button that instantly clears all
// three boxes (spec section 3, "Cross-box safety") -- no confirmation, by
// design, since the boxes are independent and cheap to retype.

(function () {
  const refreshBtn = document.getElementById("refresh-all-btn");
  if (!refreshBtn) return;

  refreshBtn.addEventListener("click", () => {
    if (window.resetRepairBox) window.resetRepairBox();
    if (window.resetSaleBox) window.resetSaleBox();
    if (window.resetPasteBox) window.resetPasteBox();
  });
})();
