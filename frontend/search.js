// Search screen (spec section 7): full browse on open, live text filter,
// date range, three independent status toggles, two independently
// scrolling/lazy-loading columns.
//
// Also reused, unmodified, by the Reprint screen's embedded search bar
// (spec: "its own search bar, same behaviour as main Search") -- both
// pages share this exact file and the same element ids, so "same
// behaviour" can never drift between the two screens.

(function () {
  const repairsList = document.getElementById("repairs-list");
  const salesList = document.getElementById("sales-list");
  if (!repairsList || !salesList) return; // not on a page with search

  const PAGE_SIZE = 25;

  const repairsRows = document.getElementById("repairs-rows");
  const salesRows = document.getElementById("sales-rows");
  const repairsSentinel = document.getElementById("repairs-sentinel");
  const salesSentinel = document.getElementById("sales-sentinel");

  const qInput = document.getElementById("search-q");
  const dateFromInput = document.getElementById("search-date-from");
  const dateToInput = document.getElementById("search-date-to");
  const collectedSelect = document.getElementById("search-collected");
  const readySelect = document.getElementById("search-ready");
  const paidSelect = document.getElementById("search-paid");

  const repairsState = { offset: 0, done: false, loading: false };
  const salesState = { offset: 0, done: false, loading: false };

  function currentFilters() {
    return {
      q: qInput.value.trim(),
      date_from: dateFromInput.value,
      date_to: dateToInput.value,
      collected: collectedSelect.value,
      ready: readySelect.value,
      paid: paidSelect.value,
    };
  }

  function applyFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    qInput.value = params.get("q") || "";
    dateFromInput.value = params.get("date_from") || "";
    dateToInput.value = params.get("date_to") || "";
    collectedSelect.value = params.get("collected") || "any";
    readySelect.value = params.get("ready") || "any";
    paidSelect.value = params.get("paid") || "any";
  }

  // Filter changes replace the current history entry (not push a new
  // one) so the URL always reflects "what's on screen right now" without
  // filling up Back history with every keystroke. Navigating away to a
  // detail page and hitting Back then lands on this exact URL -- same
  // search term, dates, and filters (spec section 7).
  function syncUrl() {
    const filters = currentFilters();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== "any") params.set(key, value);
    }
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
  }

  // A bare balance figure is ambiguous in a one-line row: "£0.00" reads
  // like "this job was worth nothing" when it actually means "fully
  // paid, nothing left to collect". Show what the job was worth once
  // there's nothing owed, and only label a figure "Balance" when it's
  // actually money still due -- so the number on screen always answers
  // "do I need to collect anything here?" without a second look.
  //
  // balance_pence <= 0 covers three genuinely different situations that
  // used to render identically (just the total, implying "done"):
  // actually done; paid up to what's KNOWN but a fault is still pending
  // a price (more could be owed later); and overpaid (balance is
  // strictly negative, not just zero -- money to reconcile or refund).
  // Money still owed (balance > 0) always wins regardless of a pending
  // fault -- that's the one unambiguous, most-actionable signal and
  // shouldn't get buried under a "pending" flag. Between the other two,
  // pending-item wins over overpaid when a ticket is somehow both at
  // once (rare) -- "you still need to price something" is more
  // actionable at a glance than "there's a few quid to reconcile".
  function repairMoneyDisplay(r) {
    if (r.total_pence === null) return "Pending";
    if (r.balance_pence > 0) return `Balance ${r.balance_display}`;
    if (r.has_pending_faults) return `${r.total_display} · pending item`;
    if (r.balance_pence < 0) return `Overpaid ${r.balance_display.slice(1)}`;
    return r.total_display;
  }

  function repairRowHtml(r) {
    // Passcode shown right in the list (not just once you open the
    // ticket) so staff can hand a phone back without opening every
    // result first -- blank when never given (it's an optional field).
    const passcodePart = r.passcode ? ` · <span class="passcode-match-name">${escapeHtml(r.passcode)}</span>` : "";
    return `
      <div class="left">
        <div class="primary">${escapeHtml(r.ticket)} · ${escapeHtml(r.name)}${passcodePart}</div>
        <div class="secondary">${escapeHtml(r.model)} · ${escapeHtml(r.status)}</div>
      </div>
      <div class="right">
        <div>${escapeHtml(repairMoneyDisplay(r))}</div>
        <div class="secondary">${escapeHtml(formatDateTime(r.created_at))}</div>
      </div>
    `;
  }

  function saleRowHtml(s) {
    return `
      <div class="left">
        <div class="primary">${escapeHtml(s.item)}</div>
        <div class="secondary">${escapeHtml(s.name)} · ${escapeHtml(s.method)}</div>
      </div>
      <div class="right">
        <div>${escapeHtml(s.price_display)}</div>
        <div class="secondary">${escapeHtml(formatDateTime(s.sold_at))}</div>
      </div>
    `;
  }

  function appendRow(container, html, href) {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = html;
    row.addEventListener("click", () => {
      window.location.href = href;
    });
    container.appendChild(row);
  }

  async function loadRepairsPage(reset) {
    if (repairsState.loading) return;
    if (reset) {
      repairsState.offset = 0;
      repairsState.done = false;
      repairsRows.innerHTML = "";
    }
    if (repairsState.done) return;
    repairsState.loading = true;
    try {
      const filters = currentFilters();
      const params = new URLSearchParams({ ...filters, offset: repairsState.offset, limit: PAGE_SIZE });
      const results = await api.get(`/api/search/repairs?${params}`);
      if (results.length === 0 && repairsState.offset === 0) {
        repairsRows.innerHTML = '<p class="empty-note">No repairs match.</p>';
      }
      results.forEach((r) =>
        appendRow(repairsRows, repairRowHtml(r), `/detail?type=repair&ticket=${encodeURIComponent(r.ticket)}`)
      );
      repairsState.offset += results.length;
      if (results.length < PAGE_SIZE) repairsState.done = true;
    } finally {
      repairsState.loading = false;
    }
  }

  async function loadSalesPage(reset) {
    if (salesState.loading) return;
    if (reset) {
      salesState.offset = 0;
      salesState.done = false;
      salesRows.innerHTML = "";
    }
    if (salesState.done) return;

    const filters = currentFilters();
    // Collected and Ready are pure repair-only concepts -- a sale has no
    // status to be "collected" or "ready" for, so those two always hide
    // this column. Paid is different: a sale IS always paid in full the
    // moment it's created, so "Paid" is trivially true for every sale --
    // showing them there is correct, not a false match. Only "Not Paid"
    // and "Unsettled" have no honest sale equivalent (there's no such
    // thing as an unpaid or unsettled sale), so only those two Paid
    // values hide the column, not "Paid" itself.
    const paidExcludesSales = filters.paid !== "any" && filters.paid !== "yes";
    if (filters.collected !== "any" || filters.ready !== "any" || paidExcludesSales) {
      salesRows.innerHTML =
        '<p class="empty-note">Not applicable to sales -- Collected, Ready, and Not Paid/Unsettled are repair-only filters.</p>';
      salesState.done = true;
      return;
    }

    salesState.loading = true;
    try {
      const params = new URLSearchParams({
        q: filters.q,
        date_from: filters.date_from,
        date_to: filters.date_to,
        offset: salesState.offset,
        limit: PAGE_SIZE,
      });
      const results = await api.get(`/api/search/sales?${params}`);
      if (results.length === 0 && salesState.offset === 0) {
        salesRows.innerHTML = '<p class="empty-note">No sales match.</p>';
      }
      results.forEach((s) => appendRow(salesRows, saleRowHtml(s), `/detail?type=sale&id=${s.id}`));
      salesState.offset += results.length;
      if (results.length < PAGE_SIZE) salesState.done = true;
    } finally {
      salesState.loading = false;
    }
  }

  function runSearch() {
    syncUrl();
    loadRepairsPage(true);
    loadSalesPage(true);
  }

  const debouncedRunSearch = debounce(runSearch, 300);

  qInput.addEventListener("input", debouncedRunSearch);
  [dateFromInput, dateToInput, collectedSelect, readySelect, paidSelect].forEach((el) => {
    el.addEventListener("change", runSearch);
  });

  // Lazy-load: each column loads its next page only when its OWN
  // sentinel scrolls into view within its OWN list -- the two columns
  // scroll and load independently (spec section 7), so this is two
  // separate observers, not one shared trigger.
  new IntersectionObserver((entries) => entries[0].isIntersecting && loadRepairsPage(false), {
    root: repairsList,
    threshold: 0.1,
  }).observe(repairsSentinel);

  new IntersectionObserver((entries) => entries[0].isIntersecting && loadSalesPage(false), {
    root: salesList,
    threshold: 0.1,
  }).observe(salesSentinel);

  applyFiltersFromUrl();
  runSearch();

  // The browser's back/forward cache (bfcache) can restore this page
  // EXACTLY as it looked when you left it -- including rows for
  // something you just deleted or edited on the detail screen -- without
  // re-running any of the code above, since the whole page (DOM and all)
  // was frozen rather than reloaded. event.persisted is true only in
  // that restored-from-freeze case, so this re-runs the search then,
  // picking up whatever actually changed, without affecting a normal
  // first load (where persisted is always false).
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) runSearch();
  });
})();
