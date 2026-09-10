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
  DetailCard,
  Field,
  Input,
  MoneyRow,
  SectionTitle,
  Select,
} from "./DetailUi";

export default function SaleDetail({ saleId }) {
  const navigate = useNavigate();
  const { showModal } = useModal();
  const [sale, setSale] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(null);
  const [formError, setFormError] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [edit, setEdit] = useState({});

  const showErr = useCallback((msg) => {
    setError(msg);
    setTimeout(() => setError(""), 5000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/sales/${encodeURIComponent(saleId)}`);
      setSale(data);
      setPanel(null);
      setFormError("");
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openEdit() {
    let catalog = items;
    if (!catalog.length) {
      catalog = await api.get("/api/sale-items");
      setItems(catalog);
    }
    const inCatalog = catalog.includes(sale.item);
    setEdit({
      name: sale.name || "",
      item: inCatalog ? sale.item : "Other",
      custom_item: inCatalog ? "" : sale.item,
      serial: sale.serial || "",
      price: sale.price_pence != null ? String(sale.price_pence / 100) : "",
      method: sale.method || "",
    });
    setFormError("");
    setPanel("edit");
  }

  async function saveEdit() {
    setFormError("");
    try {
      const data = await api.patch(`/api/sales/${sale.id}`, edit);
      setSale(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    }
  }

  function openRefund() {
    const remaining = sale.net_price_pence;
    setRefundAmount(remaining > 0 ? String(remaining / 100) : "");
    setFormError("");
    setPanel("refund");
  }

  async function saveRefund() {
    setFormError("");
    try {
      const data = await api.post(`/api/sales/${sale.id}/refunds`, {
        amount: refundAmount,
      });
      setSale(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function reprint() {
    try {
      await printReceipt(`/api/sales/${sale.id}/print`);
    } catch (err) {
      showErr(err.message);
    }
  }

  function confirmDelete() {
    showModal({
      title: "Delete this sale?",
      message:
        "It moves to Recently Deleted for 3 days, then is purged. You can restore it from Tools in that window.",
      buttons: [
        {
          label: "Delete",
          className: "danger",
          onClick: async () => {
            await api.del(`/api/sales/${sale.id}`);
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
          <div className="h-6 w-1/2 rounded bg-bg" />
          <div className="h-16 rounded-[10px] bg-bg" />
        </div>
      </DetailCard>
    );
  }
  if (!sale) {
    return (
      <div className="rounded-[10px] px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
        {error || "Sale not found."}
      </div>
    );
  }

  const isMobile = sale.is_mobile || sale.item === "Mobile Phone";

  return (
    <DetailCard className="pb-6">
      {error ? (
        <div className="mb-3 rounded-[10px] px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {isMobile ? (
            <div className="text-[0.72rem] font-semibold uppercase tracking-wide text-ok mb-1">
              Mobile phone sale
            </div>
          ) : null}
          <h2 className="m-0 mb-1 text-lg sm:text-xl font-semibold tracking-tight">
            {sale.item}
          </h2>
          <div className="text-muted font-medium">{sale.name}</div>
          <div className="text-muted-2 text-[0.75rem] mt-1">
            Sold {formatDateTime(sale.sold_at)}
          </div>
        </div>
        <Btn variant="secondary" size="sm" onClick={reprint}>
          Print receipt
        </Btn>
      </div>

      <MoneyRow
        items={[
          { label: "Price", value: sale.price_display },
          { label: "Paid via", value: sale.method },
          {
            label: isMobile ? "IMEI" : "Serial",
            value: sale.serial_display,
          },
        ]}
      />

      {isMobile ? (
        <p className="text-muted text-[0.82rem] mb-3">
          Receipt includes a QR to your public shop page (phones for sale +
          address + contact). Manage stock in{" "}
          <button
            type="button"
            className="text-ok underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer"
            onClick={() => navigate("/tools/phones")}
          >
            Tools → Phones for sale
          </button>
          .
        </p>
      ) : null}

      {sale.refunded_pence > 0 ? (
        <p className="bg-warn-bg text-warn-text rounded-[10px] px-3 py-2 text-sm mb-3">
          Refunded {sale.refunded_display} — net paid {sale.net_price_display}
        </p>
      ) : null}

      <ActionRow>
        <Btn variant="secondary" onClick={openEdit}>
          Edit
        </Btn>
        <Btn variant="secondary" onClick={openRefund}>
          Refund
        </Btn>
        <Btn variant="danger" onClick={confirmDelete}>
          Delete
        </Btn>
      </ActionRow>

      {panel === "refund" ? (
        <div className="border border-border rounded-[10px] p-3 mt-2 bg-bg">
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

      {panel === "edit" ? (
        <div className="border border-border rounded-[10px] p-3 mt-2 bg-bg">
          <SectionTitle>Edit sale</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
            <Field label="Customer name">
              <SuggestInput
                value={edit.name}
                onChange={(v) => setEdit((e) => ({ ...e, name: v }))}
                endpoint="/api/suggest/names"
              />
            </Field>
            <Field label="Item">
              <Select
                value={edit.item}
                onChange={(e) => setEdit((ed) => ({ ...ed, item: e.target.value }))}
              >
                {items.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {edit.item === "Other" ? (
            <Field label="Custom item">
              <SuggestInput
                value={edit.custom_item}
                onChange={(v) => setEdit((e) => ({ ...e, custom_item: v }))}
                endpoint="/api/suggest/sale-custom-items"
              />
            </Field>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
            <Field label={edit.item === "Mobile Phone" ? "IMEI" : "IMEI / Serial"}>
              <Input
                placeholder="optional — prints xxxx if blank"
                value={edit.serial}
                onChange={(e) => setEdit((ed) => ({ ...ed, serial: e.target.value }))}
              />
            </Field>
            <Field
              label={
                <>
                  Price (<CurrencySymbol />)
                </>
              }
            >
              <Input
                inputMode="decimal"
                value={edit.price}
                onChange={(e) => setEdit((ed) => ({ ...ed, price: e.target.value }))}
              />
            </Field>
          </div>
          <p className="text-sm font-medium mb-1">Payment method</p>
          <div className="flex gap-2 mb-3">
            {["Cash", "Card"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setEdit((ed) => ({ ...ed, method: m }))}
                className={`flex-1 rounded-[10px] px-3 py-2.5 text-sm font-semibold border cursor-pointer touch-manipulation min-h-11 ${
                  edit.method === m
                    ? "bg-ok-bg text-ok border-ok"
                    : "bg-card text-text border-border-strong"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
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
    </DetailCard>
  );
}
