import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { CurrencySymbol, useShop } from "../../context/ShopContext";
import { useModal } from "../../context/ModalContext";
import { printReceipt } from "../../lib/printing";
import PatternPad from "../PatternPad";
import SuggestInput from "../SuggestInput";
import { formatDateTime } from "../tools/ToolsUi";
import {
  ActionRow,
  Btn,
  COLLECTED_STATUSES,
  DetailCard,
  Field,
  Input,
  MoneyRow,
  PRIMARY_STATUSES,
  STATUS_HINTS_FALLBACK,
  SectionTitle,
  Select,
  Textarea,
  formatTime,
  journeyStepIndex,
  statusBadgeClass,
} from "./DetailUi";

// The intake receipt has the passcode/pattern on it -- fine to reprint
// while the device is still being worked on (Received or In Progress),
// but not once it's Ready or beyond, where handing it out again would
// leak the unlock code past the point it's actually needed for.
const INTAKE_REPRINT_STATUSES = ["Received", "In Progress"];

export default function RepairDetail({ ticket }) {
  const navigate = useNavigate();
  const { showModal } = useModal();
  const { currencySymbol } = useShop();
  const [repair, setRepair] = useState(null);
  const [statusChoices, setStatusChoices] = useState([]);
  const [statusHints, setStatusHints] = useState({});
  const [faultChoices, setFaultChoices] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [panel, setPanel] = useState(null); // fault | payment | refund | edit
  // The status being confirmed in the Collect popup (e.g. "Collected"), or
  // null when the popup's closed. Kept separate from `panel` so "+ Add
  // fault" can still open panel === "fault" *inside* the popup.
  const [collecting, setCollecting] = useState(null);
  // Set to the entered pence figure while the Collect popup is waiting on
  // "this doesn't cover the balance -- settle it anyway?"; null otherwise.
  // Any payment-field or fault edit clears it -- it's a snapshot of one
  // specific typed amount, stale the moment that amount changes.
  const [shortfallConfirm, setShortfallConfirm] = useState(null);
  // Same idea, for Not Agreed/Fixed - Collected specifically: set to the
  // entered pence figure while waiting on "is this a diagnostic fee?".
  // That status has no real balance to fall short of (the repair never
  // happened), so it's asked instead of the shortfall question above --
  // the two are mutually exclusive, gated on which status was clicked.
  const [diagnosticFeeConfirm, setDiagnosticFeeConfirm] = useState(null);
  const [faultEditId, setFaultEditId] = useState(null);
  const [faultPriceDraft, setFaultPriceDraft] = useState("");
  const [formError, setFormError] = useState("");
  // Guards every button below that hits the API -- one shared flag for the
  // whole screen (not one per action) so a click can't fire twice AND so
  // two different mutations (e.g. add fault + save payment) can't race each
  // other and clobber the single `repair` state each response replaces.
  const [saving, setSaving] = useState(false);

  // Add fault form
  const [faultChoice, setFaultChoice] = useState("");
  const [faultOther, setFaultOther] = useState("");
  const [faultPrice, setFaultPrice] = useState("");

  // Payment form
  const [payMethod, setPayMethod] = useState("Card");
  const [payAmount, setPayAmount] = useState("");
  const [payCash, setPayCash] = useState("");
  const [payCard, setPayCard] = useState("");
  // Whichever side of a Cash+Card split the counter actually typed into --
  // the other one is always just its computed remainder, never typed
  // directly, so this is what a live balance change (Collect popup fault
  // edits) re-anchors the remainder calculation on.
  const [splitAnchor, setSplitAnchor] = useState("cash");

  // Refund form
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("");

  // Edit form
  const [edit, setEdit] = useState({});

  const showErr = useCallback((msg) => {
    setError(msg);
    setTimeout(() => setError(""), 5000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Repair first for perceived speed; meta in parallel; hints soft-fail
      // so a stale proxy (missing /api/status-hints) never blanks the page.
      const [statusesRes, hintsRes, choicesRes, dataRes] = await Promise.allSettled([
        api.get("/api/status-choices"),
        api.get("/api/status-hints"),
        api.get("/api/fault-add-choices"),
        api.get(`/api/repairs/${encodeURIComponent(ticket)}`),
      ]);

      if (dataRes.status !== "fulfilled") {
        throw dataRes.reason || new Error("Could not load repair");
      }

      setRepair(dataRes.value);
      setStatusChoices(
        statusesRes.status === "fulfilled" ? statusesRes.value : PRIMARY_STATUSES
      );
      setStatusHints(
        hintsRes.status === "fulfilled" && hintsRes.value
          ? hintsRes.value
          : STATUS_HINTS_FALLBACK
      );
      setFaultChoices(choicesRes.status === "fulfilled" ? choicesRes.value : []);
      setPanel(null);
      setCollecting(null);
      setFaultEditId(null);
      setFormError("");
      setError("");
    } catch (err) {
      setError(err.message || String(err));
      setRepair(null);
    } finally {
      setLoading(false);
    }
  }, [ticket]);

  useEffect(() => {
    load();
  }, [load]);

  async function applyStatus(status) {
    if (saving) return null;
    setSaving(true);
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/status`,
        { status }
      );
      setRepair(data);
      setPanel(null);
      return data;
    } catch (err) {
      showErr(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  /** Anything still needed before this ticket can be marked Collected --
   * an unpriced fault, no agreed total, or money still owed. Used only to
   * decide whether a standalone payment that just cleared the balance
   * should offer "Mark Collected?" -- the Collect popup runs its own,
   * richer version of this same check against the amount being entered.
   */
  function hasOutstanding(r = repair) {
    if (!r) return true;
    if (r.has_pending_faults) return true;
    if (r.total_pence === null) return true;
    return r.balance_pence > 0;
  }

  /** The amount the Collect popup is actually trying to take right now:
   * for a normal Collected ticket, the outstanding balance -- or, once
   * there's nothing left owing, the ticket's total instead of leaving
   * the field blank, same reasoning as resetPaymentForm below. For Not
   * Agreed/Fixed - Collected, where the repair itself was never
   * charged for, it's whatever's still needed to reach the ticket's
   * own "Diagnostic" fault price (a real, first-class intake fault
   * type, not free text) instead -- staying at £0 if there's no
   * Diagnostic fault to go on. A ticket quoted "Diagnostic: £30"
   * that's already had £5 paid toward it needs £25 more to land on
   * exactly that £30, not the other fault's (never-charged) repair
   * price and not the £30 again from scratch.
   */
  function targetPenceFor(status, r) {
    if (status === "Not Agreed/Fixed - Collected") {
      const diagnosticFeePence = (r.faults || [])
        .filter((f) => f.description === "Diagnostic" && f.price_pence != null)
        .reduce((sum, f) => sum + f.price_pence, 0);
      return Math.max(diagnosticFeePence - r.paid_pence, 0);
    }
    return r.balance_pence > 0 ? r.balance_pence : Math.max(r.total_pence || 0, 0);
  }

  /** Seeds the payment fields from the current balance -- shared by the
   * standalone +Payment panel and the Collect popup (which immediately
   * overrides this with targetPenceFor's own figure, so this is really
   * for the standalone panel) so both start from the same defaults
   * (Card, pre-filled). Falls back to the ticket's total when there's
   * no balance left to pre-fill from (already fully paid, or £0 total)
   * -- a blank box gives staff nothing to go on; the total is at least
   * a real, useful number to start from and edit down if needed.
   */
  function resetPaymentForm(r = repair) {
    setPayMethod("Card");
    const fallbackPence = r.balance_pence > 0 ? r.balance_pence : r.total_pence;
    setPayAmount(fallbackPence > 0 ? String(fallbackPence / 100) : "");
    setPayCash("");
    setPayCard("");
    setSplitAnchor("cash");
    setShortfallConfirm(null);
    setDiagnosticFeeConfirm(null);
    setFormError("");
  }

  function openPaymentForm(r = repair) {
    resetPaymentForm(r);
    setPanel("payment");
  }

  /** Whichever side of the split the counter typed into, fill the other
   * with what's left of `balancePence` -- so a £35 balance with £20 typed
   * into Cash puts £15 into Card automatically, instead of making the
   * till work out the remainder by hand. Only computes the OTHER field;
   * never overwrites the one actually being typed into. Defaults to the
   * live balance, but takes it explicitly too -- resyncPaymentToBalance
   * needs to recompute against a fresh balance that hasn't reached
   * `repair` state yet.
   */
  function remainderFor(typedValue, balancePence = repair.balance_pence) {
    if (!(balancePence > 0)) return null;
    const typedPence = Math.round((parseFloat(typedValue) || 0) * 100);
    const remainingPence = balancePence - typedPence;
    return remainingPence > 0 ? String(remainingPence / 100) : "0";
  }

  function onPayCashChange(value) {
    setPayCash(value);
    setSplitAnchor("cash");
    setShortfallConfirm(null);
    setDiagnosticFeeConfirm(null);
    const remainder = remainderFor(value);
    if (remainder !== null) setPayCard(remainder);
  }

  function onPayCardChange(value) {
    setPayCard(value);
    setSplitAnchor("card");
    setShortfallConfirm(null);
    setDiagnosticFeeConfirm(null);
    const remainder = remainderFor(value);
    if (remainder !== null) setPayCash(remainder);
  }

  function onPayMethodChange(value) {
    setPayMethod(value);
    setShortfallConfirm(null);
    setDiagnosticFeeConfirm(null);
  }

  function onPayAmountChange(value) {
    setPayAmount(value);
    setShortfallConfirm(null);
    setDiagnosticFeeConfirm(null);
  }

  /** Keeps the Collect popup's payment field(s) tracking targetPenceFor
   * as faults get added/priced/removed inside it -- a fault priced up
   * from Pending should land straight in the amount to take, not leave
   * it stuck at whatever it was seeded with when the popup first
   * opened; for Not Agreed/Fixed - Collected that means the Diagnostic
   * fee remaining, not the balance. Split re-anchors on whichever side
   * was actually typed into (splitAnchor) and recomputes the other as
   * its remainder, the same way typing into it manually already works
   * -- not a guess at how the counter wants it divided, just the same
   * math run again against the new target.
   */
  function resyncPaymentToBalance(r) {
    setShortfallConfirm(null);
    setDiagnosticFeeConfirm(null);
    const target = targetPenceFor(collecting, r);
    if (payMethod === "Split") {
      if (target <= 0) {
        setPayCash("");
        setPayCard("");
        return;
      }
      const anchorValue = splitAnchor === "cash" ? payCash : payCard;
      if (!anchorValue) return;
      const remainder = remainderFor(anchorValue, target) ?? "0";
      if (splitAnchor === "cash") setPayCard(remainder);
      else setPayCash(remainder);
      return;
    }
    setPayAmount(target > 0 ? String(target / 100) : "");
  }

  /** Records whatever the payment fields currently hold, exactly the way
   * the standalone +Payment panel does it -- shared so the Collect popup
   * takes payment through the same call, not a second copy of it.
   */
  async function submitPayment() {
    return payMethod === "Split"
      ? api.post(`/api/repairs/${encodeURIComponent(repair.ticket)}/payments/split`, {
          cash: payCash,
          card: payCard,
        })
      : api.post(`/api/repairs/${encodeURIComponent(repair.ticket)}/payments`, {
          amount: payAmount,
          method: payMethod,
        });
  }

  function onStatusClick(status) {
    if (!repair || status === repair.status) return;

    // One-way door: once actually collected (paid, settled, handed
    // over), the status is locked -- no going back to an earlier stage
    // (the device isn't even in the shop any more), and no switching to
    // the OTHER collected status either. Whichever one was actually
    // confirmed through the Collect popup is final (enforced the same
    // way on the backend, so this can't be bypassed by calling the API
    // directly).
    if (COLLECTED_STATUSES.includes(repair.status)) {
      showErr("This ticket has already been collected — its status can't be changed.");
      return;
    }

    if (!COLLECTED_STATUSES.includes(status)) {
      applyStatus(status);
      return;
    }

    openCollectModal(status);
  }

  /** Opens the Collect popup: review the faults, take payment, then
   * "Print collection" marks the ticket `status` and prints in one step.
   * Nothing here touches the ticket -- Back just closes it again, status
   * exactly where it was.
   */
  function openCollectModal(status) {
    resetPaymentForm(repair);
    // Overrides resetPaymentForm's own balance-based seed with
    // targetPenceFor's status-aware figure -- a no-op recompute for
    // normal Collected (same value either way), the actual fix for
    // Not Agreed/Fixed - Collected (the ticket's Diagnostic fee, not
    // the never-charged repair balance).
    const target = targetPenceFor(status, repair);
    setPayAmount(target > 0 ? String(target / 100) : "");
    setPanel(null);
    setCollecting(status);
  }

  function closeCollectModal() {
    setCollecting(null);
    setPanel(null);
    setShortfallConfirm(null);
    setDiagnosticFeeConfirm(null);
    setFormError("");
  }

  /** The Collect popup's one confirming action. If the entered amount
   * doesn't cover the balance, asks first instead of just refusing --
   * "Settled" accepts the shortfall as a deliberate write-off (the
   * collection receipt still prints the real amount left owing, never a
   * false £0); "Cancel" changes nothing, leaving the typed amount in
   * place to fix. A full amount skips straight to completeCollection.
   */
  function printCollection() {
    if (saving || !collecting) return;
    setFormError("");
    if (repair.has_pending_faults) {
      setFormError("Price every fault first — the total isn't final yet.");
      return;
    }
    if (repair.total_pence === null) {
      setFormError("This ticket has no agreed total. Set fault prices before collecting.");
      return;
    }
    const enteredPence =
      payMethod === "Split"
        ? Math.round((parseFloat(payCash) || 0) * 100) +
          Math.round((parseFloat(payCard) || 0) * 100)
        : Math.round((parseFloat(payAmount) || 0) * 100);

    // Not Agreed/Fixed - Collected: the repair never happened, so the
    // quoted balance isn't a real "shortfall" question -- anything
    // entered can only be a diagnostic fee, confirmed explicitly rather
    // than assumed.
    if (collecting === "Not Agreed/Fixed - Collected") {
      if (enteredPence > 0) {
        setDiagnosticFeeConfirm(enteredPence);
        return;
      }
      completeCollection(enteredPence);
      return;
    }

    const owedPence = Math.max(repair.balance_pence, 0);
    if (owedPence > 0 && enteredPence < owedPence) {
      setShortfallConfirm(enteredPence);
      return;
    }

    completeCollection(enteredPence);
  }

  /** Takes the entered payment (if any), settles it, marks the ticket
   * `collecting`, then prints -- in that order. Settle has to land
   * before the status change because the backend's own Collected gate
   * requires balance-cleared-or-settled to already be true at that
   * point; the collection receipt route then refuses to print until the
   * status is already one of COLLECTED_STATUSES. Stops at the first
   * failure, so a payment that fails partway never reaches the status
   * update -- the ticket stays exactly as it was.
   */
  async function completeCollection(enteredPence) {
    setSaving(true);
    try {
      let data = repair;
      // For a normal Collected ticket, only actually submit a payment
      // if something's genuinely still owed. Once balance_pence is
      // already <= 0, targetPenceFor fills the Amount field with the
      // ticket's total as a reference default rather than leaving it
      // blank -- left untouched, that's not a new charge to take, and
      // submitting it here would double up a payment that's already
      // settled. Not Agreed/Fixed - Collected has no such default (its
      // field starts blank/diagnostic-fee-aware), so anything entered
      // there is always a deliberate new diagnostic fee.
      const shouldSubmit =
        enteredPence > 0 &&
        (collecting === "Not Agreed/Fixed - Collected" || repair.balance_pence > 0);
      if (shouldSubmit) {
        data = await submitPayment();
        setRepair(data);
      }

      // Settle BEFORE the status update, not after -- the backend's own
      // Collected gate requires balance-cleared-or-settled to already be
      // true at the moment status actually changes (it enforces the same
      // rule this popup does, so hitting the API directly can't skip it),
      // and a shortfall accepted via "Settle & print" only clears that
      // bar once settled is set.
      if (!data.settled) {
        data = await api.post(`/api/repairs/${encodeURIComponent(data.ticket)}/settle`, {
          settled: true,
        });
        setRepair(data);
      }

      data = await api.post(`/api/repairs/${encodeURIComponent(data.ticket)}/status`, {
        status: collecting,
      });
      setRepair(data);

      await printReceipt(
        `/api/repairs/${encodeURIComponent(data.ticket)}/print/collection`
      );
      setCollecting(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteFault(fault) {
    if (saving) return;
    if (COLLECTED_STATUSES.includes(repair.status)) {
      showErr("Can't remove a fault once the ticket has been collected.");
      return;
    }
    const doDelete = async () => {
      setSaving(true);
      try {
        const data = await api.del(
          `/api/repairs/${encodeURIComponent(repair.ticket)}/faults/${fault.id}`
        );
        setRepair(data);
        if (collecting) resyncPaymentToBalance(data);
      } catch (err) {
        showErr(err.message);
      } finally {
        setSaving(false);
      }
    };
    if (fault.price_pence > 0) {
      showModal({
        title: "Remove this fault?",
        message: `"${fault.description}" (${fault.price_display}) will be removed from ${repair.ticket} — the total will drop by that amount. This can't be undone.`,
        buttons: [
          { label: "Remove", className: "danger", onClick: doDelete },
          { label: "Cancel", className: "secondary" },
        ],
      });
    } else {
      doDelete();
    }
  }

  async function saveFaultPrice(faultId, price) {
    if (saving) return;
    setSaving(true);
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/faults/${faultId}/price`,
        { price }
      );
      setRepair(data);
      if (collecting) resyncPaymentToBalance(data);
      setFaultEditId(null);
      setFaultPriceDraft("");
    } catch (err) {
      showErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveFault() {
    if (saving) return;
    setFormError("");
    setSaving(true);
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/faults`,
        {
          fault: faultChoice,
          fault_other: faultOther,
          price: faultPrice,
        }
      );
      setRepair(data);
      if (collecting) resyncPaymentToBalance(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function savePayment() {
    if (saving) return;
    setFormError("");
    setSaving(true);
    try {
      const data = await submitPayment();
      setRepair(data);
      setPanel(null);

      // After payment: if balance cleared, offer Collect in one step.
      if (!hasOutstanding(data) && !COLLECTED_STATUSES.includes(data.status)) {
        showModal({
          title: "Outstanding cleared",
          message: `Paid in full (${data.balance_display}). Mark as Collected now?`,
          buttons: [
            {
              label: "Mark Collected",
              onClick: async () => {
                const updated = await applyStatus("Collected");
                if (updated && !updated.settled) {
                  try {
                    const settled = await api.post(
                      `/api/repairs/${encodeURIComponent(updated.ticket)}/settle`,
                      { settled: true }
                    );
                    setRepair(settled);
                  } catch {
                    /* ignore */
                  }
                }
              },
            },
            { label: "Not yet", className: "secondary" },
          ],
        });
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openRefundForm() {
    setRefundMethod("");
    setRefundAmount(
      repair.balance_pence < 0 ? String(Math.abs(repair.balance_pence) / 100) : ""
    );
    setFormError("");
    setPanel("refund");
  }

  async function saveRefund() {
    if (saving) return;
    if (!refundMethod) {
      setFormError("Pick Cash or Card");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/refunds`,
        { amount: refundAmount, method: refundMethod }
      );
      setRepair(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSettled() {
    if (saving) return;
    setSaving(true);
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/settle`,
        { settled: !repair.settled }
      );
      setRepair(data);
    } catch (err) {
      showErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit() {
    const first = repair.faults?.[0];
    setEdit({
      name: repair.name || "",
      phone: repair.phone || "",
      passcode: repair.passcode || "",
      model: repair.model || "",
      price:
        first && first.price_pence != null ? String(first.price_pence / 100) : "",
      notes: repair.notes || "",
    });
    setFormError("");
    setPanel("edit");
  }

  /** Same field set as openEdit (saveEdit always sends the whole thing),
   * just landing straight on the Note panel instead of the full form --
   * a quick way to leave a message without touching name/phone/etc.
   */
  function openNoteEdit() {
    openEdit();
    setPanel("note");
  }

  async function saveEdit() {
    if (saving) return;
    setFormError("");
    setSaving(true);
    try {
      const data = await api.patch(
        `/api/repairs/${encodeURIComponent(repair.ticket)}`,
        edit
      );
      setRepair(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function reprint(kind) {
    if (saving) return;
    if (kind === "intake" && !INTAKE_REPRINT_STATUSES.includes(repair.status)) {
      showErr("Intake receipt can only be reprinted while the ticket is 'Received' or 'In Progress'.");
      return;
    }
    const collected = COLLECTED_STATUSES.includes(repair.status);
    if (kind === "collection" && !collected) {
      showErr("Collection receipt is only for collected tickets.");
      return;
    }
    setSaving(true);
    try {
      await printReceipt(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/print/${kind}`
      );
    } catch (err) {
      showErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    showModal({
      title: "Delete this repair?",
      message:
        "It moves to Recently Deleted for 3 days, then is purged. You can restore it from Tools in that window.",
      buttons: [
        {
          label: "Delete",
          className: "danger",
          onClick: async () => {
            await api.del(`/api/repairs/${encodeURIComponent(repair.ticket)}`);
            navigate("/search");
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  }

  /** The fault list rows -- shown on the main screen and, unchanged,
   * inside the Collect popup, so removing/pricing a fault behaves and
   * looks identically in both places. */
  function renderFaultRows() {
    return faults.map((fault) => (
      <div
        key={fault.id}
        className="py-2.5 px-1 flex flex-col sm:flex-row sm:flex-wrap sm:justify-between gap-2 items-stretch sm:items-start"
      >
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">
            {fault.description}
            {fault.added_at ? (
              <span className="text-muted font-normal">
                {" "}
                · {formatTime(fault.added_at)}
              </span>
            ) : null}
          </div>
          {fault.reason ? (
            <div className="text-muted text-[0.82rem]">{fault.reason}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {fault.price_pence == null ? (
            faultEditId === fault.id ? (
              <>
                <Input
                  className="!w-24"
                  inputMode="decimal"
                  placeholder="0=free"
                  value={faultPriceDraft}
                  onChange={(e) => setFaultPriceDraft(e.target.value)}
                />
                <Btn
                  size="sm"
                  disabled={saving}
                  onClick={() => saveFaultPrice(fault.id, faultPriceDraft)}
                >
                  Set
                </Btn>
                <Btn variant="secondary" size="sm" disabled={saving} onClick={() => setFaultEditId(null)}>
                  Cancel
                </Btn>
              </>
            ) : (
              <>
                <span className="text-warn-text text-sm font-medium">Pending</span>
                <Btn
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFaultEditId(fault.id);
                    setFaultPriceDraft("");
                  }}
                >
                  Set price
                </Btn>
              </>
            )
          ) : faultEditId === fault.id ? (
            <>
              <Input
                className="!w-24"
                inputMode="decimal"
                value={faultPriceDraft}
                onChange={(e) => setFaultPriceDraft(e.target.value)}
              />
              <Btn
                size="sm"
                disabled={saving}
                onClick={() => saveFaultPrice(fault.id, faultPriceDraft)}
              >
                Save
              </Btn>
              <Btn variant="secondary" size="sm" disabled={saving} onClick={() => setFaultEditId(null)}>
                Cancel
              </Btn>
            </>
          ) : (
            <>
              <span className="font-semibold text-sm tabular-nums">
                {fault.price_display}
              </span>
              <Btn
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFaultEditId(fault.id);
                  setFaultPriceDraft(String(fault.price_pence / 100));
                }}
              >
                Edit
              </Btn>
            </>
          )}
          <Btn variant="danger" size="sm" disabled={saving} onClick={() => deleteFault(fault)}>
            Remove
          </Btn>
        </div>
      </div>
    ));
  }

  /** "+ Add fault" and its form -- shown on the main screen and, unchanged,
   * inside the Collect popup, so a fault added there is saved through the
   * exact same call and immediately reflected in both places. */
  function renderAddFaultSection() {
    return panel === "fault" ? (
      <div className="border border-border rounded-[10px] p-3 mb-3 bg-bg">
        <Field label="Fault">
          <Select value={faultChoice} onChange={(e) => setFaultChoice(e.target.value)}>
            {faultChoices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        {faultChoice === "Other" ? (
          <Field label="Other (describe)">
            <SuggestInput
              value={faultOther}
              onChange={setFaultOther}
              endpoint="/api/suggest/fault-descriptions"
            />
          </Field>
        ) : null}
        <Field
          label={
            <>
              Price (<CurrencySymbol />, blank = pending, 0 = free)
            </>
          }
        >
          <Input
            inputMode="decimal"
            value={faultPrice}
            onChange={(e) => setFaultPrice(e.target.value)}
          />
        </Field>
        <ActionRow>
          <Btn disabled={saving} onClick={saveFault}>Save fault</Btn>
          <Btn variant="secondary" onClick={() => setPanel(null)}>
            Cancel
          </Btn>
        </ActionRow>
        {formError ? (
          <div className="text-error-text text-sm">{formError}</div>
        ) : null}
      </div>
    ) : (
      <Btn
        variant="secondary"
        size="sm"
        onClick={() => {
          // "Other" is the default -- not just whichever choice happens
          // to load first -- so this stays correct even if the list's
          // order ever changes.
          setFaultChoice("Other");
          setFaultOther("");
          setFaultPrice("");
          setFormError("");
          setPanel("fault");
        }}
      >
        + Add fault
      </Btn>
    );
  }

  /** Method + amount field(s) -- shown in the standalone +Payment panel
   * and, unchanged, inside the Collect popup. */
  function renderPaymentFields() {
    return (
      <>
        <Field label="Method">
          <Select value={payMethod} onChange={(e) => onPayMethodChange(e.target.value)}>
            <option value="Card">Card</option>
            <option value="Cash">Cash</option>
            <option value="Split">Cash + Card</option>
          </Select>
        </Field>
        {payMethod === "Split" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label={
                <>
                  Cash (<CurrencySymbol />)
                </>
              }
            >
              <Input
                inputMode="decimal"
                value={payCash}
                onChange={(e) => onPayCashChange(e.target.value)}
              />
            </Field>
            <Field
              label={
                <>
                  Card (<CurrencySymbol />)
                </>
              }
            >
              <Input
                inputMode="decimal"
                value={payCard}
                onChange={(e) => onPayCardChange(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <Field
            label={
              <>
                Amount (<CurrencySymbol />)
              </>
            }
          >
            <Input
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => onPayAmountChange(e.target.value)}
            />
          </Field>
        )}
      </>
    );
  }

  if (loading) {
    return (
      <DetailCard>
        <div className="animate-pulse space-y-3 py-2">
          <div className="h-6 w-2/3 rounded bg-bg" />
          <div className="h-4 w-1/3 rounded bg-bg" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="h-16 rounded-[10px] bg-bg" />
            <div className="h-16 rounded-[10px] bg-bg" />
            <div className="h-16 rounded-[10px] bg-bg" />
          </div>
        </div>
      </DetailCard>
    );
  }
  if (!repair) {
    return (
      <div className="rounded-[10px] px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
        {error || "Repair not found."}
      </div>
    );
  }

  const faults = repair.faults || [];
  const payments = repair.payments || [];
  const hints = { ...STATUS_HINTS_FALLBACK, ...statusHints };
  const primaryStatuses = PRIMARY_STATUSES.filter((s) => statusChoices.includes(s));
  const otherStatuses = statusChoices.filter((s) => !PRIMARY_STATUSES.includes(s));
  // Grid display order only -- "Collected" swaps cells with "Not
  // Agreed/Fixed - In Shop", then again with "Not Agreed/Fixed -
  // Collected", both on request. Every other bit of behaviour
  // (active/declined styling, click handling, journey step) reads the
  // status string itself, not its position here, so this is purely
  // cosmetic.
  const statusGrid = [
    ...(primaryStatuses.length ? primaryStatuses : PRIMARY_STATUSES),
    ...otherStatuses,
  ];
  const swapGridCells = (a, b) => {
    const idxA = statusGrid.indexOf(a);
    const idxB = statusGrid.indexOf(b);
    if (idxA !== -1 && idxB !== -1) {
      [statusGrid[idxA], statusGrid[idxB]] = [statusGrid[idxB], statusGrid[idxA]];
    }
  };
  swapGridCells("Collected", "Not Agreed/Fixed - In Shop");
  swapGridCells("Collected", "Not Agreed/Fixed - Collected");
  const step = journeyStepIndex(repair.status);
  const balanceDue = !repair.has_pending_faults && repair.balance_pence > 0;
  const canCollect =
    !repair.has_pending_faults &&
    repair.balance_pence != null &&
    repair.balance_pence <= 0 &&
    !COLLECTED_STATUSES.includes(repair.status);

  return (
    <>
      <DetailCard className="pb-24 sm:pb-4">
        {error ? (
          <div className="mb-3 rounded-[10px] px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
            {error}
          </div>
        ) : null}

        {/* Header */}
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="m-0 text-lg sm:text-xl font-semibold tracking-tight">
                {repair.ticket}
              </h2>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[0.72rem] font-semibold ${statusBadgeClass(repair.status)}`}
              >
                {repair.status}
              </span>
            </div>
            <div className="font-medium text-[0.95rem] truncate">
              {repair.name}
              {repair.phone ? (
                <span className="text-text font-medium"> · {repair.phone}</span>
              ) : null}
            </div>
            <div className="text-muted text-sm truncate">
              {repair.model}
              {repair.passcode ? (
                <span className="text-text font-medium"> · PIN {repair.passcode}</span>
              ) : null}
            </div>
            <div className="text-muted-2 text-[0.75rem] mt-1">
              In {formatDateTime(repair.created_at)}
            </div>
          </div>
          {repair.pattern ? (
            <div className="flex flex-col items-center gap-1 shrink-0">
              <span className="text-muted-2 text-[0.7rem] font-semibold uppercase tracking-wide">
                Pattern
              </span>
              <PatternPad value={repair.pattern} readOnly size={84} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 shrink-0">
            <Btn
              variant="secondary"
              size="sm"
              disabled={saving || !INTAKE_REPRINT_STATUSES.includes(repair.status)}
              onClick={() => reprint("intake")}
            >
              Re-Print Intake
            </Btn>
            <Btn
              variant="secondary"
              size="sm"
              disabled={saving || !COLLECTED_STATUSES.includes(repair.status)}
              onClick={() => reprint("collection")}
            >
              Re-Print Collection
            </Btn>
          </div>
        </div>

        {/* Money first — counter needs this at a glance */}
        <MoneyRow
          items={[
            { label: "Total", value: repair.total_display },
            { label: "Paid", value: repair.paid_display },
            {
              label: "Balance",
              value: repair.balance_display,
              emphasize: balanceDue,
            },
          ]}
        />
        {repair.has_pending_faults ? (
          <p className="bg-warn-bg text-warn-text rounded-[10px] px-3 py-2 text-sm mb-2">
            Price every fault before Collect — total isn’t final yet.
          </p>
        ) : null}

        {/* Journey stepper */}
        <SectionTitle>Repair journey</SectionTitle>
        <div className="flex gap-1.5 mb-3" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={`h-1.5 flex-1 rounded-full ${
                n <= step ? "bg-ok" : "bg-border-strong"
              }`}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {statusGrid.map((status) => {
            const active = status === repair.status;
            const declined = !PRIMARY_STATUSES.includes(status);
            return (
              <button
                key={status}
                type="button"
                disabled={saving}
                onClick={() => onStatusClick(status)}
                className={`rounded-xl px-3 py-2.5 text-left border touch-manipulation transition-colors min-h-[3.25rem] disabled:opacity-50 ${
                  active
                    ? declined
                      ? "bg-error-bg text-error-text border-error shadow-sm"
                      : "bg-ok-bg text-ok border-ok shadow-sm"
                    : "bg-bg text-text border-border-strong hover:bg-secondary-hover active:scale-[0.99]"
                }`}
              >
                <div className="text-sm font-semibold leading-tight">{status}</div>
                <div className="text-[0.7rem] opacity-70 mt-0.5 leading-snug">
                  {hints[status]}
                </div>
              </button>
            );
          })}
        </div>
        {repair.track_url ? (
          <p className="text-muted text-[0.75rem] mb-3 break-all leading-snug">
            Customer QR →{" "}
            <a
              className="text-info-text underline underline-offset-2"
              href={repair.track_url}
              target="_blank"
              rel="noreferrer"
            >
              {repair.track_url}
            </a>
          </p>
        ) : null}

        <SectionTitle>What we’re fixing</SectionTitle>
        <div className="divide-y divide-border mb-2 -mx-1">{renderFaultRows()}</div>
        {renderAddFaultSection()}

        <SectionTitle>Payments</SectionTitle>
        <div className="divide-y divide-border mb-2">
          {payments.length === 0 ? (
            <p className="text-muted text-sm py-2">No payments yet.</p>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="py-2 flex justify-between text-sm">
                <span>
                  {p.is_refund || p.amount_pence < 0
                    ? `Refund (${p.method})`
                    : p.method}
                  <span className="text-muted"> · {formatTime(p.paid_at)}</span>
                </span>
                <span className="font-semibold tabular-nums">{p.amount_display}</span>
              </div>
            ))
          )}
        </div>

        <ActionRow>
          <Btn variant="secondary" size="sm" onClick={() => openPaymentForm()}>
            + Payment
          </Btn>
          <Btn variant="secondary" size="sm" onClick={openRefundForm}>
            + Refund
          </Btn>
          <Btn variant="secondary" size="sm" disabled={saving} onClick={toggleSettled}>
            {repair.settled ? "Unsettle" : "Settle"}
          </Btn>
        </ActionRow>

        {panel === "payment" ? (
          <div className="border border-border rounded-[10px] p-3 mb-3 bg-bg">
            {renderPaymentFields()}
            <ActionRow>
              <Btn disabled={saving} onClick={savePayment}>Save payment</Btn>
              <Btn variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Btn>
            </ActionRow>
            {formError ? (
              <div className="text-error-text text-sm">{formError}</div>
            ) : null}
          </div>
        ) : null}

        {panel === "refund" ? (
          <div className="border border-border rounded-[10px] p-3 mb-3 bg-bg">
            <Field
              label={
                <>
                  Put refund amount (<CurrencySymbol />) if different
                </>
              }
            >
              <Input
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </Field>
            <p className="text-sm font-medium mb-1">Refunded via</p>
            <div className="flex gap-2 mb-3">
              {["Cash", "Card"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRefundMethod(m)}
                  className={`flex-1 rounded-[10px] px-3 py-2.5 text-sm font-semibold border cursor-pointer touch-manipulation min-h-11 ${
                    refundMethod === m
                      ? "bg-ok-bg text-ok border-ok"
                      : "bg-card text-text border-border-strong"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <ActionRow>
              <Btn disabled={saving} onClick={saveRefund}>Save refund</Btn>
              <Btn variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Btn>
            </ActionRow>
            {formError ? (
              <div className="text-error-text text-sm">{formError}</div>
            ) : null}
          </div>
        ) : null}

        <SectionTitle>Note</SectionTitle>
        {panel === "note" ? (
          <div className="border border-border rounded-[10px] p-3 mb-3 bg-bg">
            <Textarea
              rows={3}
              autoFocus
              value={edit.notes}
              onChange={(e) => setEdit((ed) => ({ ...ed, notes: e.target.value }))}
            />
            <ActionRow>
              <Btn disabled={saving} onClick={saveEdit}>
                Save note
              </Btn>
              <Btn variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Btn>
            </ActionRow>
            {formError ? (
              <div className="text-error-text text-sm">{formError}</div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={openNoteEdit}
            className="block w-full text-left text-muted text-sm rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 mb-3 bg-transparent cursor-pointer hover:bg-secondary-hover touch-manipulation whitespace-pre-wrap"
          >
            {repair.notes || "(no note) -- tap to add one"}
          </button>
        )}

        <ActionRow>
          <Btn variant="secondary" onClick={openEdit}>
            Edit details
          </Btn>
          <Btn variant="danger" onClick={confirmDelete}>
            Delete
          </Btn>
        </ActionRow>

        {panel === "edit" ? (
          <div className="border border-border rounded-[10px] p-3 mt-2 bg-bg">
            <SectionTitle>Edit drop-off details</SectionTitle>
            <p className="text-muted text-sm mb-3">Only changed fields get updated.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
              <Field label="Name">
                <SuggestInput
                  value={edit.name}
                  onChange={(v) => setEdit((e) => ({ ...e, name: v }))}
                  endpoint="/api/suggest/names"
                />
              </Field>
              <Field label="Phone">
                <SuggestInput
                  value={edit.phone}
                  onChange={(v) => setEdit((e) => ({ ...e, phone: v }))}
                  endpoint="/api/suggest/phones"
                />
              </Field>
              <Field label="Passcode">
                <Input
                  value={edit.passcode}
                  onChange={(e) => setEdit((ed) => ({ ...ed, passcode: e.target.value }))}
                />
              </Field>
              <Field label="Model">
                <SuggestInput
                  value={edit.model}
                  onChange={(v) => setEdit((e) => ({ ...e, model: v }))}
                  endpoint="/api/suggest/models"
                />
              </Field>
            </div>
            <Field label="Price — first/intake fault only">
              <Input
                inputMode="decimal"
                value={edit.price}
                onChange={(e) => setEdit((ed) => ({ ...ed, price: e.target.value }))}
              />
            </Field>
            <Field label="Note">
              <Textarea
                rows={3}
                value={edit.notes}
                onChange={(e) => setEdit((ed) => ({ ...ed, notes: e.target.value }))}
              />
            </Field>
            <ActionRow>
              <Btn disabled={saving} onClick={saveEdit}>Save changes</Btn>
              <Btn variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Btn>
            </ActionRow>
            {formError ? (
              <div className="text-error-text text-sm">{formError}</div>
            ) : null}
          </div>
        ) : null}

        {/* Mobile sticky actions */}
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card/95 backdrop-blur-md px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
          <div className="flex gap-2 w-full">
            <Btn
              variant="secondary"
              className="flex-1"
              onClick={() => openPaymentForm(repair)}
            >
              Pay
            </Btn>
            {canCollect ? (
              <Btn className="flex-[1.4]" disabled={saving} onClick={() => onStatusClick("Collected")}>
                Collect
              </Btn>
            ) : balanceDue ? (
              <Btn className="flex-[1.4]" onClick={() => openPaymentForm(repair)}>
                Clear {repair.balance_display}
              </Btn>
            ) : COLLECTED_STATUSES.includes(repair.status) ? (
              <Btn
                variant="secondary"
                className="flex-[1.4]"
                disabled={saving}
                onClick={() => reprint("collection")}
              >
                Re-Print Collection
              </Btn>
            ) : (
              <Btn
                className="flex-[1.4]"
                disabled={saving}
                onClick={() =>
                  onStatusClick(
                    repair.status === "Received" ? "In Progress" : "Ready"
                  )
                }
              >
                {repair.status === "Received" ? "Start work" : "Mark ready"}
              </Btn>
            )}
          </div>
        </div>
      </DetailCard>

      {collecting
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="bg-card text-text rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 border border-border">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-lg font-semibold m-0">Mark {collecting}</h3>
                    <p className="text-muted text-sm mt-0.5">{repair.model}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-muted text-sm">{repair.ticket}</span>
                    <p className="text-muted text-sm mt-0.5">{repair.name}</p>
                  </div>
                </div>

                {repair.has_pending_faults ? (
                  <p className="bg-warn-bg text-warn-text rounded-[10px] px-3 py-2 text-sm mb-3">
                    Price every fault before printing — total isn’t final yet.
                  </p>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <div>
                    <SectionTitle>What we’re fixing</SectionTitle>
                    <div className="divide-y divide-border mb-2 -mx-1">{renderFaultRows()}</div>
                    {renderAddFaultSection()}
                  </div>

                  <div>
                    <SectionTitle>Payment</SectionTitle>
                    <div className="flex justify-between items-baseline text-sm mb-1">
                      <span className="text-muted">Total</span>
                      <span className="font-semibold tabular-nums">{repair.total_display}</span>
                    </div>
                    <div className="flex justify-between items-baseline text-sm mb-3">
                      <span className="text-muted">Balance due</span>
                      <span className="font-bold tabular-nums">{repair.balance_display}</span>
                    </div>
                    {renderPaymentFields()}
                  </div>
                </div>

                {diagnosticFeeConfirm !== null ? (
                  <div className="bg-warn-bg text-warn-text rounded-[10px] px-3 py-2 text-sm mb-3">
                    <p className="mb-2">
                      Is {currencySymbol}
                      {(diagnosticFeeConfirm / 100).toFixed(2)} a diagnostic fee? No repair was carried out.
                    </p>
                    <div className="flex gap-2">
                      <Btn size="sm" disabled={saving} onClick={() => completeCollection(diagnosticFeeConfirm)}>
                        Yes — print
                      </Btn>
                      <Btn
                        variant="secondary"
                        size="sm"
                        onClick={() => setDiagnosticFeeConfirm(null)}
                      >
                        No, edit amount
                      </Btn>
                    </div>
                  </div>
                ) : shortfallConfirm !== null ? (
                  <div className="bg-warn-bg text-warn-text rounded-[10px] px-3 py-2 text-sm mb-3">
                    <p className="mb-2">
                      {currencySymbol}
                      {((Math.max(repair.balance_pence, 0) - shortfallConfirm) / 100).toFixed(2)} short
                      of {repair.balance_display}.
                    </p>
                    <div className="flex gap-2">
                      <Btn size="sm" disabled={saving} onClick={() => completeCollection(shortfallConfirm)}>
                        Settle & print
                      </Btn>
                      <Btn variant="secondary" size="sm" onClick={() => setShortfallConfirm(null)}>
                        Cancel
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <ActionRow>
                    <Btn disabled={saving} onClick={printCollection}>
                      Print collection
                    </Btn>
                    <Btn variant="secondary" disabled={saving} onClick={closeCollectModal}>
                      Back
                    </Btn>
                  </ActionRow>
                )}
                {formError ? (
                  <div className="text-error-text text-sm">{formError}</div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
