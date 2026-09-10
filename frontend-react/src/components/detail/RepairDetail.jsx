import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { CurrencySymbol } from "../../context/ShopContext";
import { useModal } from "../../context/ModalContext";
import { printReceipt } from "../../lib/printing";
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

export default function RepairDetail({ ticket }) {
  const navigate = useNavigate();
  const { showModal } = useModal();
  const [repair, setRepair] = useState(null);
  const [statusChoices, setStatusChoices] = useState([]);
  const [statusHints, setStatusHints] = useState({});
  const [faultReasons, setFaultReasons] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [panel, setPanel] = useState(null); // fault | payment | refund | edit
  const [faultEditId, setFaultEditId] = useState(null);
  const [faultPriceDraft, setFaultPriceDraft] = useState("");
  const [formError, setFormError] = useState("");

  // Add fault form
  const [faultDesc, setFaultDesc] = useState("");
  const [faultPrice, setFaultPrice] = useState("");
  const [faultReason, setFaultReason] = useState("");
  const [faultReasonOther, setFaultReasonOther] = useState("");

  // Payment form
  const [payMethod, setPayMethod] = useState("Card");
  const [payAmount, setPayAmount] = useState("");
  const [payCash, setPayCash] = useState("");
  const [payCard, setPayCard] = useState("");

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
      const [statusesRes, hintsRes, reasonsRes, dataRes] = await Promise.allSettled([
        api.get("/api/status-choices"),
        api.get("/api/status-hints"),
        api.get("/api/fault-reasons"),
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
      setFaultReasons(reasonsRes.status === "fulfilled" ? reasonsRes.value : []);
      setPanel(null);
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
    }
  }

  /** Outstanding money still due before the phone can leave. */
  function outstandingReview(r = repair) {
    if (!r) return { blocked: true, reason: "Ticket not loaded." };
    if (r.has_pending_faults) {
      return {
        blocked: true,
        reason: "pending_faults",
        title: "Price every fault first",
        message:
          "One or more faults still need a price. Agree those prices before marking Collected — the total isn't final yet.",
      };
    }
    if (r.total_pence === null) {
      return {
        blocked: true,
        reason: "no_total",
        title: "No total yet",
        message: "This ticket has no agreed total. Set fault prices before collecting.",
      };
    }
    if (r.balance_pence > 0) {
      return {
        blocked: true,
        reason: "balance",
        title: "Outstanding balance",
        message: `Still owed ${r.balance_display}. Add a payment covering the balance before you can mark Collected.`,
        total: r.total_display,
        paid: r.paid_display,
        balance: r.balance_display,
      };
    }
    return { blocked: false };
  }

  function openPaymentForm(r = repair) {
    setPayMethod("Card");
    setPayAmount(r.balance_pence > 0 ? String(r.balance_pence / 100) : "");
    setPayCash("");
    setPayCard("");
    setFormError("");
    setPanel("payment");
  }

  function onStatusClick(status) {
    if (!repair || status === repair.status) return;

    if (!COLLECTED_STATUSES.includes(status)) {
      applyStatus(status);
      return;
    }

    // Collect flow: block if anything outstanding; never change status yet.
    const review = outstandingReview(repair);
    if (review.blocked) {
      const lines =
        review.reason === "balance"
          ? `Total ${review.total}\nPaid ${review.paid}\nOutstanding ${review.balance}\n\n${review.message}`
          : review.message;
      showModal({
        title: review.title,
        message: lines,
        buttons: [
          {
            label: review.reason === "balance" ? "Add payment" : "OK",
            onClick: () => {
              if (review.reason === "balance") openPaymentForm(repair);
            },
          },
          { label: "Cancel", className: "secondary" },
        ],
      });
      return;
    }

    // Clear to collect — short confirm, then mark collected (+ settled if needed).
    showModal({
      title: `Mark as ${status}?`,
      message: `Balance is cleared (${repair.balance_display}). This will mark the ticket collected so you can print the collection receipt.`,
      buttons: [
        {
          label: "Mark collected",
          onClick: async () => {
            const data = await applyStatus(status);
            if (data && !data.settled) {
              try {
                const settled = await api.post(
                  `/api/repairs/${encodeURIComponent(data.ticket)}/settle`,
                  { settled: true }
                );
                setRepair(settled);
              } catch {
                // Status already applied; settle is best-effort.
              }
            }
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  }

  async function deleteFault(fault) {
    if (COLLECTED_STATUSES.includes(repair.status)) {
      showErr("Can't remove a fault once the ticket has been collected.");
      return;
    }
    const doDelete = async () => {
      try {
        const data = await api.del(
          `/api/repairs/${encodeURIComponent(repair.ticket)}/faults/${fault.id}`
        );
        setRepair(data);
      } catch (err) {
        showErr(err.message);
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
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/faults/${faultId}/price`,
        { price }
      );
      setRepair(data);
      setFaultEditId(null);
      setFaultPriceDraft("");
    } catch (err) {
      showErr(err.message);
    }
  }

  async function saveFault() {
    setFormError("");
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/faults`,
        {
          description: faultDesc,
          price: faultPrice,
          reason: faultReason,
          reason_other: faultReasonOther,
        }
      );
      setRepair(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function savePayment() {
    setFormError("");
    try {
      let data;
      if (payMethod === "Split") {
        data = await api.post(
          `/api/repairs/${encodeURIComponent(repair.ticket)}/payments/split`,
          { cash: payCash, card: payCard }
        );
      } else {
        data = await api.post(
          `/api/repairs/${encodeURIComponent(repair.ticket)}/payments`,
          { amount: payAmount, method: payMethod }
        );
      }
      setRepair(data);
      setPanel(null);

      // After payment: if balance cleared, offer Collect in one step.
      const review = outstandingReview(data);
      if (!review.blocked && !COLLECTED_STATUSES.includes(data.status)) {
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
    if (!refundMethod) {
      setFormError("Pick Cash or Card");
      return;
    }
    setFormError("");
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/refunds`,
        { amount: refundAmount, method: refundMethod }
      );
      setRepair(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function toggleSettled() {
    try {
      const data = await api.post(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/settle`,
        { settled: !repair.settled }
      );
      setRepair(data);
    } catch (err) {
      showErr(err.message);
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

  async function saveEdit() {
    setFormError("");
    try {
      const data = await api.patch(
        `/api/repairs/${encodeURIComponent(repair.ticket)}`,
        edit
      );
      setRepair(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function reprint(kind) {
    const collected = COLLECTED_STATUSES.includes(repair.status);
    if (kind === "intake" && collected) {
      showErr("Intake receipt is for tickets still in the shop.");
      return;
    }
    if (kind === "collection" && !collected) {
      showErr("Collection receipt is only for collected tickets.");
      return;
    }
    try {
      await printReceipt(
        `/api/repairs/${encodeURIComponent(repair.ticket)}/print/${kind}`
      );
    } catch (err) {
      showErr(err.message);
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
  const step = journeyStepIndex(repair.status);
  const balanceDue = !repair.has_pending_faults && repair.balance_pence > 0;
  const canCollect =
    !repair.has_pending_faults &&
    repair.balance_pence != null &&
    repair.balance_pence <= 0 &&
    !COLLECTED_STATUSES.includes(repair.status);

  let priceLineOld = null;
  if (faults.length > 1) {
    const lastFault = faults[faults.length - 1];
    if (lastFault && lastFault.price_pence !== null) {
      const earlier = faults.slice(0, -1);
      const earlierPending = earlier.some((f) => f.price_pence === null);
      if (earlierPending) {
        priceLineOld = "Pending";
      } else {
        const oldPence = earlier.reduce((sum, f) => sum + (f.price_pence || 0), 0);
        const sample = (repair.total_display || "").replace(/^-/, "");
        const match = sample.match(/^(.*?)\d+\.\d{2}$/);
        const symbol = match ? match[1] : "£";
        priceLineOld = `${symbol}${(oldPence / 100).toFixed(2)}`;
      }
    }
  }

  return (
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
          <div className="font-medium text-[0.95rem] truncate">{repair.name}</div>
          <div className="text-muted text-sm truncate">
            {repair.model}
            {repair.passcode ? (
              <span className="text-text font-medium"> · PIN {repair.passcode}</span>
            ) : null}
          </div>
          <div className="text-muted-2 text-[0.75rem] mt-1">
            In {formatDateTime(repair.created_at)} · Updated{" "}
            {formatDateTime(repair.updated_at)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Btn variant="secondary" size="sm" onClick={() => reprint("intake")}>
            Print intake
          </Btn>
          <Btn variant="secondary" size="sm" onClick={() => reprint("collection")}>
            Print collect
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
      {priceLineOld ? (
        <p className="text-muted text-sm -mt-1 mb-2">
          Was <span className="line-through">{priceLineOld}</span> → now{" "}
          <strong className="text-text">{repair.total_display}</strong>
        </p>
      ) : null}

      {repair.has_pending_faults ? (
        <p className="bg-warn-bg text-warn-text rounded-[10px] px-3 py-2 text-sm mb-2">
          Price every fault before Collect — total isn’t final yet.
        </p>
      ) : null}
      {balanceDue ? (
        <div className="bg-warn-bg text-warn-text rounded-[10px] px-3 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2 mb-2">
          <span>
            <strong>Outstanding {repair.balance_display}</strong> before handover.
          </span>
          <Btn
            size="sm"
            variant="secondary"
            className="!bg-card"
            onClick={() => openPaymentForm(repair)}
          >
            Take payment
          </Btn>
        </div>
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
      <div className="grid grid-cols-2 gap-2 mb-2">
        {(primaryStatuses.length ? primaryStatuses : PRIMARY_STATUSES).map((status) => {
          const active = status === repair.status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => onStatusClick(status)}
              className={`rounded-xl px-3 py-2.5 text-left border touch-manipulation transition-colors min-h-[3.25rem] ${
                active
                  ? "bg-ok-bg text-ok border-ok shadow-sm"
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
      {otherStatuses.length ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {otherStatuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusClick(status)}
              title={hints[status]}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border touch-manipulation ${
                status === repair.status
                  ? "bg-error-bg text-error-text border-error"
                  : "bg-card text-muted border-border-strong hover:bg-bg"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      ) : null}
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
      <div className="divide-y divide-border mb-2 -mx-1">
        {faults.map((fault) => (
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
                      onClick={() => saveFaultPrice(fault.id, faultPriceDraft)}
                    >
                      Set
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
                    onClick={() => saveFaultPrice(fault.id, faultPriceDraft)}
                  >
                    Save
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
              <Btn variant="danger" size="sm" onClick={() => deleteFault(fault)}>
                Remove
              </Btn>
            </div>
          </div>
        ))}
      </div>

      {panel === "fault" ? (
        <div className="border border-border rounded-[10px] p-3 mb-3 bg-bg">
          <Field label="Description">
            <SuggestInput
              value={faultDesc}
              onChange={setFaultDesc}
              endpoint="/api/suggest/fault-descriptions"
            />
          </Field>
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
          <p className="text-muted text-sm mb-1">Why?</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {faultReasons.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setFaultReason(reason)}
                className={`rounded-[10px] px-3 py-2 text-sm font-medium border cursor-pointer touch-manipulation ${
                  faultReason === reason
                    ? "bg-ok-bg text-ok border-ok"
                    : "bg-card text-text border-border-strong"
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
          {faultReason === "Other" ? (
            <Field label="Other reason">
              <SuggestInput
                value={faultReasonOther}
                onChange={setFaultReasonOther}
                endpoint="/api/suggest/fault-reasons"
              />
            </Field>
          ) : null}
          <ActionRow>
            <Btn onClick={saveFault}>Save fault</Btn>
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
            setFaultDesc("");
            setFaultPrice("");
            setFaultReason(faultReasons[0] || "");
            setFaultReasonOther("");
            setFormError("");
            setPanel("fault");
          }}
        >
          + Add fault
        </Btn>
      )}

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
        <Btn variant="secondary" size="sm" onClick={toggleSettled}>
          {repair.settled ? "Unsettle" : "Settle"}
        </Btn>
      </ActionRow>

      {panel === "payment" ? (
        <div className="border border-border rounded-[10px] p-3 mb-3 bg-bg">
          <Field label="Method">
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
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
                  onChange={(e) => setPayCash(e.target.value)}
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
                  onChange={(e) => setPayCard(e.target.value)}
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
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </Field>
          )}
          <ActionRow>
            <Btn onClick={savePayment}>Save payment</Btn>
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
            <Btn onClick={saveRefund}>Save refund</Btn>
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
      <p className="text-muted text-sm">{repair.notes || "(no note)"}</p>

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
            <Btn onClick={saveEdit}>Save changes</Btn>
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
            <Btn className="flex-[1.4]" onClick={() => onStatusClick("Collected")}>
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
              onClick={() => reprint("collection")}
            >
              Print collect
            </Btn>
          ) : (
            <Btn
              className="flex-[1.4]"
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
  );
}
