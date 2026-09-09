// Universal detail screen (spec section 4: "ONE fixed layout for every
// repair") plus the simpler sale detail view. Reached from Search or
// Reprint via /detail?type=repair&ticket=DF0001 or /detail?type=sale&id=5.
//
// Every write (status, add fault, add payment, settle, edit) re-fetches
// the full detail and re-renders from scratch -- simplest way to keep the
// screen always showing the true current state, and this is a single-
// counter tool, not a page with heavy render cost to worry about.

(function () {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const ticket = params.get("ticket");
  const saleId = params.get("id");

  const loadingNote = document.getElementById("loading-note");
  const errorEl = document.getElementById("detail-error");
  const repairSection = document.getElementById("repair-detail");
  const saleSection = document.getElementById("sale-detail");

  document.getElementById("back-btn").addEventListener("click", () => goBack("/search"));

  function showLoadError(message) {
    loadingNote.classList.add("hidden");
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }

  if (type === "repair" && ticket) {
    loadRepair(ticket);
  } else if (type === "sale" && saleId) {
    loadSale(saleId);
  } else {
    showLoadError("No ticket or sale specified.");
  }

  // ===================== REPAIR =====================

  let currentRepair = null;
  let faultReasonChoices = [];
  let statusChoices = [];
  // Which fault's price is mid-edit right now (its own inline input open),
  // or null if none. Lives outside renderFaults() so it survives the
  // full re-render every write triggers -- otherwise clicking Edit,
  // which itself just calls renderRepair() to swap that one row's view,
  // would immediately erase the state it just set.
  let faultBeingEdited = null;

  // Must match app.constants.COLLECTED_STATUSES exactly -- the collection
  // receipt (final payment breakdown + warranty date) only makes sense
  // once the phone has actually left the shop.
  const COLLECTED_STATUSES = ["Collected", "Not Agreed/Fixed - Collected"];

  async function loadRepair(ticketNumber) {
    try {
      [statusChoices, faultReasonChoices, currentRepair] = await Promise.all([
        api.get("/api/status-choices"),
        api.get("/api/fault-reasons"),
        api.get(`/api/repairs/${encodeURIComponent(ticketNumber)}`),
      ]);
    } catch (err) {
      showLoadError(err.message);
      return;
    }
    loadingNote.classList.add("hidden");
    repairSection.classList.remove("hidden");
    renderRepair();
    wireRepairActionsOnce();
  }

  function statusSlug(status) {
    return "status-" + status.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function renderRepair() {
    const r = currentRepair;
    // Every successful write re-renders from here (see the file-level
    // comment above). If a warning from an earlier action is still up,
    // reaching a successful render means it's been dealt with -- clear it
    // now instead of leaving it up for the rest of its timeout.
    errorEl.classList.add("hidden");
    document.getElementById("r-ticket").textContent = r.ticket;
    document.getElementById("r-name").textContent = r.name;
    // Same "· passcode" treatment as the Search list (dot-separated,
    // matching the name's own font/size, no colour override) so opening
    // a single ticket shows it here too, not just in the list row.
    document.getElementById("r-passcode-line").innerHTML = r.passcode
      ? ` · <span class="passcode-match-name">${escapeHtml(r.passcode)}</span>`
      : "";
    document.getElementById("r-model").textContent = r.model;
    const badge = document.getElementById("r-status-badge");
    badge.textContent = r.status;
    badge.className = "status-badge " + statusSlug(r.status);
    document.getElementById("r-timestamps").textContent =
      `Created ${formatDateTime(r.created_at)} · Updated ${formatDateTime(r.updated_at)}`;

    renderStatusRow(r);
    renderFaults(r);
    renderPriceLine(r);
    document.getElementById("r-total").textContent = r.total_display;
    document.getElementById("r-paid").textContent = r.paid_display;
    document.getElementById("r-balance").textContent = r.balance_display;
    document.getElementById("r-pending-note").classList.toggle("hidden", !r.has_pending_faults);
    renderPayments(r);

    const settleBtn = document.getElementById("r-settle-btn");
    settleBtn.textContent = r.settled ? "Unmark settled" : "Mark settled";

    document.getElementById("r-note-display").textContent = r.notes || "(no note)";

    // Hide the add-fault / add-payment / edit forms on every re-render so
    // a save doesn't leave a stale form open with old values.
    document.getElementById("r-add-fault-form").classList.add("hidden");
    document.getElementById("r-add-payment-form").classList.add("hidden");
    document.getElementById("r-add-refund-form").classList.add("hidden");
    document.getElementById("r-edit-form").classList.add("hidden");
  }

  function renderStatusRow(r) {
    const row = document.getElementById("r-status-row");
    row.innerHTML = "";
    for (const status of statusChoices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = status;
      if (status === r.status) btn.classList.add("current");
      btn.addEventListener("click", () => {
        if (status === currentRepair.status) return;
        // Moving into either "collected" status is the moment the phone
        // is about to leave the shop and the collection receipt is about
        // to be printed -- ask once, right here, whether a payment needs
        // adding first. Either answer still applies the status change;
        // "Yes" just also jumps straight to the existing Add Payment
        // form (already prefilled with whatever's owed) so there's no
        // hunting for it afterward.
        if (COLLECTED_STATUSES.includes(status)) {
          showModal({
            title: "Add a payment now?",
            message: "So it's ready before you print the collection receipt.",
            buttons: [
              { label: "Yes", onClick: () => applyStatus(status, true) },
              { label: "No", className: "secondary", onClick: () => applyStatus(status, false) },
            ],
          });
          return;
        }
        applyStatus(status, false);
      });
      row.appendChild(btn);
    }
  }

  async function applyStatus(status, openPayment) {
    try {
      currentRepair = await api.post(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}/status`, { status });
      renderRepair();
      if (openPayment) {
        const addPaymentBtn = document.getElementById("r-add-payment-btn");
        addPaymentBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        addPaymentBtn.click();
      }
    } catch (err) {
      showTransientError(err.message);
    }
  }

  // Shared by both a pending fault's Remove button and a priced fault's
  // Remove button (see renderFaults) -- same rule either way: blocked
  // once the ticket's been collected (mirrors faults.delete_fault's own
  // check, done here too so the click gets an immediate answer instead
  // of waiting on a round trip that was always going to fail), and only
  // warns first if the fault actually carries money (removing a pending
  // or £0 fault can never change the total, so nothing to confirm).
  function wireFaultRemoveButton(removeBtn, r, fault) {
    removeBtn.addEventListener("click", () => {
      if (COLLECTED_STATUSES.includes(r.status)) {
        showTransientError("Can't remove a fault once the ticket has been collected.");
        return;
      }
      const doDelete = async () => {
        try {
          currentRepair = await api.del(
            `/api/repairs/${encodeURIComponent(r.ticket)}/faults/${fault.id}`
          );
          renderRepair();
        } catch (err) {
          showTransientError(err.message);
        }
      };
      if (fault.price_pence > 0) {
        showModal({
          title: "Remove this fault?",
          message: `"${fault.description}" (${fault.price_display}) will be removed from ${r.ticket} -- the total will drop by that amount. This can't be undone.`,
          buttons: [
            { label: "Remove", className: "danger", onClick: doDelete },
            { label: "Cancel", className: "secondary" },
          ],
        });
      } else {
        doDelete();
      }
    });
  }

  function renderFaults(r) {
    const list = document.getElementById("r-faults-list");
    list.innerHTML = "";
    r.faults.forEach((fault) => {
      const row = document.createElement("div");
      row.className = "line-item";
      // The intake fault shares the exact same timestamp as the ticket's
      // created_at (both come from one _now_iso() call at creation --
      // see repairs.create_repair); anything added later gets its own,
      // later added_at, which is when the "added HH:MM" tag applies.
      const addedLater = fault.added_at !== r.created_at;
      const metaParts = [];
      if (addedLater) metaParts.push(`added ${formatTime(fault.added_at)}`);
      if (fault.reason) metaParts.push(fault.reason);
      const descHtml = `
        <div>
          <span class="desc">${escapeHtml(fault.description)}</span>
          ${metaParts.length ? `<span class="meta">${escapeHtml(metaParts.join(" · "))}</span>` : ""}
        </div>
      `;
      const isPending = fault.price_pence === null;
      // A fault left pending at Add Fault time previously had no way to
      // ever get a real price -- Edit only ever corrects the FIRST
      // fault's price (see edit_repair). This is the fix: an inline
      // price control, wired to POST .../faults/{id}/price
      // (app.faults.set_fault_price -- works on a pending OR an
      // already-priced fault, correcting a mistake either way).
      if (isPending || fault.id === faultBeingEdited) {
        const currentValue = isPending ? "" : (fault.price_pence / 100).toFixed(2);
        // "Pending" and "genuinely never going to be charged" (e.g. a
        // free diagnostic) look identical otherwise -- 0 IS a real price
        // (not pending, has_pending_faults clears), it's just not
        // obvious that typing it is the way to say "no charge" rather
        // than leaving the fault open forever. Only worth spelling out
        // while it's actually pending -- once it has a real price, the
        // box shows that value instead of a placeholder anyway.
        const placeholder = isPending ? "0=free" : "0.00";
        row.innerHTML = `
          ${descHtml}
          <span class="fault-price-set">
            <input type="text" inputmode="decimal" class="fault-price-input" placeholder="${placeholder}" value="${escapeHtml(currentValue)}">
            <button type="button" class="secondary small fault-price-save-btn">${isPending ? "Set price" : "Save"}</button>
            ${isPending
              ? '<button type="button" class="danger small fault-remove-btn">Remove</button>'
              : '<button type="button" class="secondary small fault-price-cancel-btn">Cancel</button>'}
          </span>
        `;
        const input = row.querySelector(".fault-price-input");
        const btn = row.querySelector(".fault-price-save-btn");
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            currentRepair = await api.post(
              `/api/repairs/${encodeURIComponent(r.ticket)}/faults/${fault.id}/price`,
              { price: input.value }
            );
            faultBeingEdited = null;
            renderRepair();
          } catch (err) {
            showTransientError(err.message);
            btn.disabled = false;
          }
        });
        if (isPending) {
          wireFaultRemoveButton(row.querySelector(".fault-remove-btn"), r, fault);
        } else {
          row.querySelector(".fault-price-cancel-btn").addEventListener("click", () => {
            faultBeingEdited = null;
            renderRepair();
          });
        }
      } else {
        row.innerHTML = `
          ${descHtml}
          <span class="fault-price-set">
            <span class="amount">${escapeHtml(fault.price_display)}</span>
            <button type="button" class="secondary small fault-price-edit-btn">Edit</button>
            <button type="button" class="danger small fault-remove-btn">Remove</button>
          </span>
        `;
        row.querySelector(".fault-price-edit-btn").addEventListener("click", () => {
          faultBeingEdited = fault.id;
          renderRepair();
        });
        wireFaultRemoveButton(row.querySelector(".fault-remove-btn"), r, fault);
      }
      list.appendChild(row);
    });
  }

  function renderPriceLine(r) {
    const el = document.getElementById("r-price-line");
    const faults = r.faults;
    // Show old total -> new total only when the most recently added
    // fault itself carries a price (spec section 4: "old price struck
    // through with an arrow to the new one") -- otherwise there's
    // nothing meaningful to compare yet.
    const lastFault = faults[faults.length - 1];
    if (faults.length <= 1 || !lastFault || lastFault.price_pence === null) {
      el.textContent = r.total_display;
      return;
    }
    // Computed from the fault list directly (not by subtracting from the
    // current total) so it's correct even when an EARLIER fault is still
    // pending: that "old" total was never a real number to begin with,
    // so it's shown as "Pending" rather than a misleading £0.00.
    const earlierFaults = faults.slice(0, -1);
    const earlierHasPending = earlierFaults.some((f) => f.price_pence === null);
    const oldTotalPence = earlierFaults.reduce((sum, f) => sum + (f.price_pence || 0), 0);
    const oldText = earlierHasPending ? "Pending" : formatPenceLike(oldTotalPence, r.total_display);
    el.innerHTML = `<span class="old-price">${escapeHtml(oldText)}</span> &rarr; <span>${escapeHtml(r.total_display)}</span>`;
  }

  function renderPayments(r) {
    const list = document.getElementById("r-payments-list");
    list.innerHTML = "";
    if (r.payments.length === 0) {
      list.innerHTML = '<p class="hint">No payments yet.</p>';
      return;
    }
    r.payments.forEach((payment) => {
      const row = document.createElement("div");
      row.className = "line-item";
      // A refund is the same row shape as a payment, just a negative
      // amount (see app.payments.add_refund) -- label it plainly so it
      // never reads as an unexplained negative number in the list.
      const label = payment.is_refund ? `Refund (${payment.method})` : payment.method;
      row.innerHTML = `
        <div>
          <span class="desc">${escapeHtml(label)}</span>
          <span class="meta">${escapeHtml(formatDateTime(payment.paid_at))}</span>
        </div>
        <span class="amount">${escapeHtml(payment.amount_display)}</span>
      `;
      list.appendChild(row);
    });
  }

  function showTransientError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    setTimeout(() => errorEl.classList.add("hidden"), 11000);
  }

  let repairActionsWired = false;

  function wireRepairActionsOnce() {
    if (repairActionsWired) return;
    repairActionsWired = true;

    // These are real <form> elements now (so the app's own form/label/
    // input styling applies -- see style.css's `form label`/`form input`
    // rules), but every Save button inside them is type="button" with its
    // own click handler, not type="submit". Nothing should ever trigger a
    // native submit, but block it anyway in case a future single-field
    // state ever implicitly triggers one -- a submit with no `action`
    // would otherwise reload the page and lose whatever was typed.
    ["r-add-fault-form", "r-add-payment-form", "r-add-refund-form", "r-edit-form"].forEach((id) => {
      document.getElementById(id).addEventListener("submit", (event) => event.preventDefault());
    });

    // Suggests from this shop's own past data, same engine and same
    // per-field isolation as Home's boxes (see app/suggestions.py) --
    // these are the exact same underlying fields, just reached later in
    // a ticket's life via Edit or Add Fault instead of at intake.
    attachSuggestions(document.getElementById("r-edit-name-input"), "/api/suggest/names");
    attachSuggestions(document.getElementById("r-edit-phone-input"), "/api/suggest/phones");
    attachSuggestions(document.getElementById("r-edit-model-input"), "/api/suggest/models");
    attachSuggestions(document.getElementById("r-fault-desc-input"), "/api/suggest/fault-descriptions");
    attachSuggestions(document.getElementById("r-reason-other-input"), "/api/suggest/fault-reasons");

    // ---- Add fault ----
    const addFaultBtn = document.getElementById("r-add-fault-btn");
    const addFaultForm = document.getElementById("r-add-fault-form");
    const faultDescInput = document.getElementById("r-fault-desc-input");
    const faultPriceInput = document.getElementById("r-fault-price-input");
    const reasonRow = document.getElementById("r-reason-row");
    const reasonOtherLabel = document.getElementById("r-reason-other-label");
    const reasonOtherInput = document.getElementById("r-reason-other-input");
    const faultErrorEl = document.getElementById("r-fault-error");
    let selectedReason = null;

    reasonRow.innerHTML = "";
    faultReasonChoices.forEach((reason) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = reason;
      btn.addEventListener("click", () => {
        selectedReason = reason;
        reasonRow.querySelectorAll("button").forEach((b) => b.classList.remove("current"));
        btn.classList.add("current");
        reasonOtherLabel.classList.toggle("hidden", reason !== "Other");
      });
      reasonRow.appendChild(btn);
    });

    addFaultBtn.addEventListener("click", () => {
      faultDescInput.value = "";
      faultPriceInput.value = "";
      reasonOtherInput.value = "";
      selectedReason = null;
      reasonRow.querySelectorAll("button").forEach((b) => b.classList.remove("current"));
      reasonOtherLabel.classList.add("hidden");
      faultErrorEl.classList.add("hidden");
      addFaultForm.classList.remove("hidden");
    });
    document.getElementById("r-fault-cancel-btn").addEventListener("click", () => {
      addFaultForm.classList.add("hidden");
    });
    document.getElementById("r-fault-save-btn").addEventListener("click", async () => {
      if (!faultDescInput.value.trim()) {
        faultErrorEl.textContent = "Description is required";
        faultErrorEl.classList.remove("hidden");
        return;
      }
      if (!selectedReason) {
        faultErrorEl.textContent = "Pick a reason";
        faultErrorEl.classList.remove("hidden");
        return;
      }
      try {
        currentRepair = await api.post(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}/faults`, {
          description: faultDescInput.value,
          price: faultPriceInput.value,
          reason: selectedReason,
          reason_other: reasonOtherInput.value,
        });
        renderRepair();
      } catch (err) {
        faultErrorEl.textContent = err.message;
        faultErrorEl.classList.remove("hidden");
      }
    });

    // ---- Add payment ----
    // A method-first dropdown (Card / Cash / Cash + Card), not a toggle
    // pair, because "Cash + Card" needs to change the form's actual
    // shape (one amount box vs. two), which a mode-selector expresses
    // more naturally than a third equal-looking pill would.
    const addPaymentBtn = document.getElementById("r-add-payment-btn");
    const addPaymentForm = document.getElementById("r-add-payment-form");
    const paymentMethodSelect = document.getElementById("r-payment-method-select");
    const paymentSingleLabel = document.getElementById("r-payment-single-label");
    const paymentAmountInput = document.getElementById("r-payment-amount-input");
    const paymentSplitFields = document.getElementById("r-payment-split-fields");
    const paymentCashInput = document.getElementById("r-payment-cash-input");
    const paymentCardInput = document.getElementById("r-payment-card-input");
    const paymentCashHint = document.getElementById("r-payment-cash-hint");
    const paymentCardHint = document.getElementById("r-payment-card-hint");
    const paymentErrorEl = document.getElementById("r-payment-error");

    // Only a real, positive balance is worth suggesting -- nothing
    // sensible to prefill on a £0 or already-overpaid ticket (same
    // reasoning as the Refund box's prefill above).
    function owedPrefill() {
      return currentRepair.balance_pence > 0 ? (currentRepair.balance_pence / 100).toFixed(2) : "";
    }

    // Cash+Card fields are deliberately never auto-filled (see the
    // conversation this came out of: auto-computing the second amount
    // risks silently recording a number nobody actually typed or
    // checked). This hint is the safe middle ground -- informational
    // text only, live-updated, never written into either box itself.
    function updateSplitHints() {
      const owed = currentRepair.balance_pence;
      if (owed === null) {
        paymentCashHint.textContent = "";
        paymentCardHint.textContent = "";
        return;
      }
      const cashPence = Math.round((parseFloat(paymentCashInput.value) || 0) * 100);
      const cardPence = Math.round((parseFloat(paymentCardInput.value) || 0) * 100);
      paymentCashHint.textContent = `(remaining: ${formatPenceLike(owed - cardPence, currentRepair.balance_display)})`;
      paymentCardHint.textContent = `(remaining: ${formatPenceLike(owed - cashPence, currentRepair.balance_display)})`;
    }

    // Shared by the dropdown's own change event AND the moment the form
    // opens -- Card is the default selection (most payments are Card),
    // so the single-amount box needs to already be showing, prefilled,
    // from the very first frame, not just after an explicit change.
    function applyPaymentMode() {
      const mode = paymentMethodSelect.value;
      if (mode === "Split") {
        paymentSingleLabel.classList.add("hidden");
        paymentSplitFields.classList.remove("hidden");
        paymentCashInput.value = "";
        paymentCardInput.value = "";
        updateSplitHints();
      } else {
        paymentSplitFields.classList.add("hidden");
        paymentSingleLabel.classList.remove("hidden");
        paymentAmountInput.value = owedPrefill();
      }
    }

    paymentMethodSelect.addEventListener("change", applyPaymentMode);
    paymentCashInput.addEventListener("input", updateSplitHints);
    paymentCardInput.addEventListener("input", updateSplitHints);

    addPaymentBtn.addEventListener("click", () => {
      paymentMethodSelect.value = "Card";
      paymentErrorEl.classList.add("hidden");
      addPaymentForm.classList.remove("hidden");
      applyPaymentMode();
    });
    document.getElementById("r-payment-cancel-btn").addEventListener("click", () => {
      addPaymentForm.classList.add("hidden");
    });
    document.getElementById("r-payment-save-btn").addEventListener("click", async () => {
      const mode = paymentMethodSelect.value;
      try {
        if (mode === "Split") {
          currentRepair = await api.post(
            `/api/repairs/${encodeURIComponent(currentRepair.ticket)}/payments/split`,
            { cash: paymentCashInput.value, card: paymentCardInput.value }
          );
        } else {
          currentRepair = await api.post(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}/payments`, {
            amount: paymentAmountInput.value,
            method: mode,
          });
        }
        renderRepair();
      } catch (err) {
        paymentErrorEl.textContent = err.message;
        paymentErrorEl.classList.remove("hidden");
      }
    });

    // ---- Refund ---- (money handed back -- e.g. a paid-for fault got
    // removed, or an overpayment by mistake; see app.payments.add_refund)
    const addRefundBtn = document.getElementById("r-add-refund-btn");
    const addRefundForm = document.getElementById("r-add-refund-form");
    const refundAmountInput = document.getElementById("r-refund-amount-input");
    const refundMethodButtons = Array.from(document.querySelectorAll("#r-refund-method-row .btn-toggle"));
    let selectedRefundMethod = null;
    const refundErrorEl = document.getElementById("r-refund-error");

    addRefundBtn.addEventListener("click", () => {
      // Pre-fill with the current overpaid amount when there is one --
      // that's the one number that's actually the obvious answer to
      // "how much should go back". Nothing to suggest when balance
      // isn't negative (no overpayment), so it starts blank instead --
      // still just a starting point, not locked, the till operator can
      // always type a different amount for a partial/deposit refund.
      refundAmountInput.value =
        currentRepair.balance_pence < 0 ? (Math.abs(currentRepair.balance_pence) / 100).toFixed(2) : "";
      selectedRefundMethod = null;
      refundMethodButtons.forEach((b) => b.classList.remove("selected"));
      refundErrorEl.classList.add("hidden");
      addRefundForm.classList.remove("hidden");
    });
    refundMethodButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        refundMethodButtons.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedRefundMethod = btn.dataset.value;
      });
    });
    document.getElementById("r-refund-cancel-btn").addEventListener("click", () => {
      addRefundForm.classList.add("hidden");
    });
    document.getElementById("r-refund-save-btn").addEventListener("click", async () => {
      if (!selectedRefundMethod) {
        refundErrorEl.textContent = "Pick Cash or Card";
        refundErrorEl.classList.remove("hidden");
        return;
      }
      try {
        currentRepair = await api.post(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}/refunds`, {
          amount: refundAmountInput.value,
          method: selectedRefundMethod,
        });
        renderRepair();
      } catch (err) {
        refundErrorEl.textContent = err.message;
        refundErrorEl.classList.remove("hidden");
      }
    });

    // ---- Settle ----
    document.getElementById("r-settle-btn").addEventListener("click", async () => {
      try {
        currentRepair = await api.post(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}/settle`, {
          settled: !currentRepair.settled,
        });
        renderRepair();
      } catch (err) {
        showTransientError(err.message);
      }
    });

    // ---- Edit ----
    const editForm = document.getElementById("r-edit-form");
    const editErrorEl = document.getElementById("r-edit-error");
    const editInputs = {
      name: document.getElementById("r-edit-name-input"),
      phone: document.getElementById("r-edit-phone-input"),
      passcode: document.getElementById("r-edit-passcode-input"),
      model: document.getElementById("r-edit-model-input"),
      price: document.getElementById("r-edit-price-input"),
      notes: document.getElementById("r-edit-notes-input"),
    };
    const editStamps = {
      name: document.getElementById("r-edit-name-stamp"),
      phone: document.getElementById("r-edit-phone-stamp"),
      passcode: document.getElementById("r-edit-passcode-stamp"),
      model: document.getElementById("r-edit-model-stamp"),
      price: document.getElementById("r-edit-price-stamp"),
      notes: document.getElementById("r-edit-notes-stamp"),
    };

    function showStamp(el, isoString, fieldLabel) {
      if (!isoString) {
        el.classList.add("hidden");
        return;
      }
      el.textContent = `edited ${formatDateTime(isoString)}`;
      el.classList.remove("hidden");
    }

    document.getElementById("r-edit-btn").addEventListener("click", () => {
      const r = currentRepair;
      const firstFault = r.faults[0];
      editInputs.name.value = r.name;
      editInputs.phone.value = r.phone;
      editInputs.passcode.value = r.passcode;
      editInputs.model.value = r.model;
      editInputs.price.value = firstFault && firstFault.price_pence !== null
        ? (firstFault.price_pence / 100).toFixed(2)
        : "";
      editInputs.notes.value = r.notes;

      showStamp(editStamps.name, r.name_edited_at);
      showStamp(editStamps.phone, r.phone_edited_at);
      showStamp(editStamps.passcode, r.passcode_edited_at);
      showStamp(editStamps.model, r.model_edited_at);
      showStamp(editStamps.price, firstFault ? firstFault.price_edited_at : null);
      showStamp(editStamps.notes, r.notes_edited_at);

      editErrorEl.classList.add("hidden");
      editForm.classList.remove("hidden");
    });
    document.getElementById("r-edit-cancel-btn").addEventListener("click", () => {
      editForm.classList.add("hidden");
    });
    document.getElementById("r-edit-save-btn").addEventListener("click", async () => {
      try {
        // Every field is sent every time with its current form value --
        // the backend (repairs.edit_repair) compares each against what's
        // actually stored and only touches, and stamps, what changed. If
        // nothing in the form differs from what's saved, nothing updates
        // at all (spec: "If nothing is changed, nothing updates").
        currentRepair = await api.patch(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}`, {
          name: editInputs.name.value,
          phone: editInputs.phone.value,
          passcode: editInputs.passcode.value,
          model: editInputs.model.value,
          price: editInputs.price.value,
          notes: editInputs.notes.value,
        });
        renderRepair();
      } catch (err) {
        editErrorEl.textContent = err.message;
        editErrorEl.classList.remove("hidden");
      }
    });

    // ---- Reprint ----
    // Two distinct receipts across a repair's life (spec section 4): the
    // intake receipt has the passcode and quoted/deposit price, valid
    // only BEFORE collection; the collection receipt has the final
    // payment breakdown and warranty date, valid only AFTER collection --
    // never both at once. Buttons stay clickable either way (not
    // disabled) so a click outside the right window always gets an
    // explicit warning explaining why, rather than a dead button with no
    // feedback. The backend enforces the exact same rule independently
    // (COLLECTED_STATUSES) -- this client-side check just avoids a round
    // trip for the common case and gives a friendlier message; a stale
    // `currentRepair` still falls through to the backend's own error via
    // the catch block below.
    document.getElementById("r-reprint-intake-btn").addEventListener("click", async (event) => {
      if (COLLECTED_STATUSES.includes(currentRepair.status)) {
        showTransientError("Can't print the intake receipt -- this ticket has already been collected.");
        return;
      }
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await printReceipt(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}/print/intake`);
      } catch (err) {
        showTransientError(err.message);
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById("r-reprint-collection-btn").addEventListener("click", async (event) => {
      if (!COLLECTED_STATUSES.includes(currentRepair.status)) {
        showTransientError("Can't print the collection receipt -- this ticket hasn't been collected yet.");
        return;
      }
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await printReceipt(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}/print/collection`);
      } catch (err) {
        showTransientError(err.message);
      } finally {
        button.disabled = false;
      }
    });

    // ---- Delete ----
    document.getElementById("r-delete-btn").addEventListener("click", () => {
      showModal({
        title: "Delete this ticket?",
        message: `${currentRepair.ticket} will move to Recently Deleted and can be restored within 3 days from Tools.`,
        buttons: [
          {
            label: "Delete",
            className: "danger",
            onClick: async () => {
              try {
                await api.del(`/api/repairs/${encodeURIComponent(currentRepair.ticket)}`);
                goBack("/search");
              } catch (err) {
                showTransientError(err.message);
              }
            },
          },
          { label: "Cancel", className: "secondary" },
        ],
      });
    });
  }

  // ===================== SALE =====================

  let currentSale = null;

  async function loadSale(id) {
    try {
      currentSale = await api.get(`/api/sales/${encodeURIComponent(id)}`);
    } catch (err) {
      showLoadError(err.message);
      return;
    }
    loadingNote.classList.add("hidden");
    saleSection.classList.remove("hidden");
    renderSale();
    wireSaleActionsOnce();
  }

  function renderSale() {
    const s = currentSale;
    // Same reasoning as renderRepair's clear -- a successful render means
    // whatever the last warning was about is done, so don't leave it up.
    errorEl.classList.add("hidden");
    document.getElementById("s-item").textContent = s.item;
    document.getElementById("s-name").textContent = s.name;
    document.getElementById("s-timestamps").textContent = `Sold ${formatDateTime(s.sold_at)}`;
    document.getElementById("s-price").textContent = s.price_display;
    document.getElementById("s-method").textContent = s.method;
    document.getElementById("s-serial").textContent = s.serial_display;
    const refundNote = document.getElementById("s-refund-note");
    if (s.refunded_pence > 0) {
      refundNote.textContent = `Refunded ${s.refunded_display} -- net paid ${s.net_price_display}.`;
      refundNote.classList.remove("hidden");
    } else {
      refundNote.classList.add("hidden");
    }
    // Hide on every re-render so a save doesn't leave a stale form open
    // with old values -- same reasoning as the repair form.
    document.getElementById("s-edit-form").classList.add("hidden");
    document.getElementById("s-add-refund-form").classList.add("hidden");
  }

  let saleActionsWired = false;

  function wireSaleActionsOnce() {
    if (saleActionsWired) return;
    saleActionsWired = true;

    // Same reasoning as wireRepairActionsOnce's equivalent guard.
    document.getElementById("s-edit-form").addEventListener("submit", (event) => event.preventDefault());
    document.getElementById("s-add-refund-form").addEventListener("submit", (event) => event.preventDefault());

    // Same suggestion engine as Home's Sale box, same fields, just
    // reached via Edit instead of at creation.
    attachSuggestions(document.getElementById("s-edit-name-input"), "/api/suggest/names");
    attachSuggestions(document.getElementById("s-edit-custom-item-input"), "/api/suggest/sale-custom-items");

    // ---- Refund ---- (see app.sales.add_sale_refund -- a running total,
    // not a ledger, since a sale has no payments list to begin with)
    const saleRefundForm = document.getElementById("s-add-refund-form");
    const saleRefundAmountInput = document.getElementById("s-refund-amount-input");
    const saleRefundErrorEl = document.getElementById("s-refund-error");
    document.getElementById("s-add-refund-btn").addEventListener("click", () => {
      // Pre-fill with everything still refundable (price minus whatever's
      // already been refunded) -- the natural "give it all back" default,
      // still just a starting point the till operator can edit down for
      // a partial refund.
      saleRefundAmountInput.value =
        currentSale.net_price_pence > 0 ? (currentSale.net_price_pence / 100).toFixed(2) : "";
      saleRefundErrorEl.classList.add("hidden");
      saleRefundForm.classList.remove("hidden");
    });
    document.getElementById("s-refund-cancel-btn").addEventListener("click", () => {
      saleRefundForm.classList.add("hidden");
    });
    document.getElementById("s-refund-save-btn").addEventListener("click", async () => {
      try {
        currentSale = await api.post(`/api/sales/${currentSale.id}/refunds`, {
          amount: saleRefundAmountInput.value,
        });
        renderSale();
      } catch (err) {
        saleRefundErrorEl.textContent = err.message;
        saleRefundErrorEl.classList.remove("hidden");
      }
    });

    document.getElementById("s-reprint-btn").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await printReceipt(`/api/sales/${currentSale.id}/print`);
      } catch (err) {
        showTransientError(err.message);
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("s-delete-btn").addEventListener("click", () => {
      showModal({
        title: "Delete this sale?",
        message: "It will move to Recently Deleted and can be restored within 3 days from Tools.",
        buttons: [
          {
            label: "Delete",
            className: "danger",
            onClick: async () => {
              try {
                await api.del(`/api/sales/${encodeURIComponent(currentSale.id)}`);
                goBack("/search");
              } catch (err) {
                showLoadError(err.message);
              }
            },
          },
          { label: "Cancel", className: "secondary" },
        ],
      });
    });

    // ---- Edit ----
    const saleEditForm = document.getElementById("s-edit-form");
    const saleEditError = document.getElementById("s-edit-error");
    const saleEditName = document.getElementById("s-edit-name-input");
    const saleEditItem = document.getElementById("s-edit-item-input");
    const saleEditCustomLabel = document.getElementById("s-edit-custom-item-label");
    const saleEditCustom = document.getElementById("s-edit-custom-item-input");
    const saleEditPrice = document.getElementById("s-edit-price-input");
    const saleEditSerial = document.getElementById("s-edit-serial-input");
    const saleEditMethodButtons = Array.from(document.querySelectorAll("#s-edit-method-row .btn-toggle"));
    const saleEditMethodInput = { value: "" };

    let saleItemChoices = null;
    async function loadSaleItemChoicesOnce() {
      if (!saleItemChoices) {
        saleItemChoices = await api.get("/api/sale-items");
        saleEditItem.innerHTML = "";
        for (const choice of saleItemChoices) {
          const opt = document.createElement("option");
          opt.value = choice;
          opt.textContent = choice;
          saleEditItem.appendChild(opt);
        }
      }
      return saleItemChoices;
    }

    function updateCustomItemVisibility() {
      saleEditCustomLabel.classList.toggle("hidden", saleEditItem.value !== "Other");
    }
    saleEditItem.addEventListener("change", updateCustomItemVisibility);

    function setSaleEditMethod(method) {
      saleEditMethodInput.value = method;
      saleEditMethodButtons.forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === method));
    }
    saleEditMethodButtons.forEach((btn) => {
      btn.addEventListener("click", () => setSaleEditMethod(btn.dataset.value));
    });

    document.getElementById("s-edit-btn").addEventListener("click", async () => {
      const s = currentSale;
      const choices = await loadSaleItemChoicesOnce();
      // The stored item is either one of the fixed choices, or free-typed
      // text saved under "Other" -- if it doesn't match a fixed choice,
      // the dropdown must show "Other" with that text in the custom box,
      // a reversal detail.js has no other precedent for (repairs don't
      // have an equivalent free-text-under-a-fixed-choice field), so
      // it's handled here rather than by the backend.
      if (choices.includes(s.item)) {
        saleEditItem.value = s.item;
        saleEditCustom.value = "";
      } else {
        saleEditItem.value = "Other";
        saleEditCustom.value = s.item;
      }
      updateCustomItemVisibility();

      saleEditName.value = s.name;
      saleEditPrice.value = (s.price_pence / 100).toFixed(2);
      saleEditSerial.value = s.serial;
      setSaleEditMethod(s.method);

      saleEditError.classList.add("hidden");
      saleEditForm.classList.remove("hidden");
    });

    document.getElementById("s-edit-cancel-btn").addEventListener("click", () => {
      saleEditForm.classList.add("hidden");
    });

    document.getElementById("s-edit-save-btn").addEventListener("click", async () => {
      if (!saleEditMethodInput.value) {
        saleEditError.textContent = "Pick Cash or Card";
        saleEditError.classList.remove("hidden");
        return;
      }
      try {
        currentSale = await api.patch(`/api/sales/${encodeURIComponent(currentSale.id)}`, {
          name: saleEditName.value,
          item: saleEditItem.value,
          custom_item: saleEditCustom.value,
          price: saleEditPrice.value,
          method: saleEditMethodInput.value,
          serial: saleEditSerial.value,
        });
        renderSale();
      } catch (err) {
        saleEditError.textContent = err.message;
        saleEditError.classList.remove("hidden");
      }
    });
  }
})();
