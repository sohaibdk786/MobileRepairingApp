import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { api } from "../../api";
import { CurrencySymbol } from "../../context/ShopContext";
import { useModal } from "../../context/ModalContext";
import { printReceipt } from "../../lib/printing";
import SuggestInput from "../SuggestInput";
import {
  Box,
  Field,
  FieldRow,
  FormSelect,
  PrimaryButton,
  StatusMessage,
  TextInput,
} from "./FormBits";

const empty = {
  name: "",
  item: "",
  custom_item: "",
  serial: "",
  price: "",
  method: "",
};

function todayLocalDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const SaleBox = forwardRef(function SaleBox(_props, ref) {
  const { showModal } = useModal();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  // Automatic (default) uses the till's current date/time, same as
  // every other sale -- Manual is only for a backdated receipt, e.g. the
  // customer never took theirs at the time and needs one printed later,
  // dated for when the sale actually happened.
  const [dateMode, setDateMode] = useState("auto"); // "auto" | "manual"
  const [saleDate, setSaleDate] = useState("");
  const [saleTime, setSaleTime] = useState("");

  useEffect(() => {
    api
      .get("/api/sale-items")
      .then((list) => {
        setItems(list);
        setForm((f) => ({ ...f, item: f.item || list[0] || "" }));
      })
      .catch(() => {});
  }, []);

  useImperativeHandle(ref, () => ({
    reset() {
      setForm({ ...empty, item: items[0] || "" });
      setDateMode("auto");
      setSaleDate("");
      setSaleTime("");
      setConfirmation("");
      setError("");
    },
  }));

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submitSale(force) {
    if (saving) return;
    if (!form.method) {
      setError("Pick Cash or Card");
      return;
    }
    let sold_at = "";
    if (dateMode === "manual") {
      if (!saleDate || !saleTime) {
        setError("Pick a date and time for the backdated sale");
        return;
      }
      sold_at = `${saleDate}T${saleTime}`;
    }
    setSaving(true);
    setError("");
    setConfirmation("");
    try {
      const data = await api.post("/api/sales", { ...form, sold_at, force: !!force });
      if (data.duplicate) {
        handleDuplicate();
        return;
      }
      setForm((f) => ({ ...f, method: "" }));
      try {
        await printReceipt(`/api/sales/${data.sale.id}/print`);
        setConfirmation(
          `Saved and printed: ${data.sale.item} (${data.sale.price_display})`
        );
      } catch (printErr) {
        setConfirmation(
          `Saved sale: ${data.sale.item} (${data.sale.price_display}) -- but printing failed: ${printErr.message}. Use Reprint to try again.`
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDuplicate() {
    showModal({
      title: "Same as the last sale?",
      message: "This looks identical to the last saved sale. Print again?",
      buttons: [
        {
          label: "Yes -- genuine repeat sale",
          onClick: () => submitSale(true),
        },
        {
          label: "No -- that was a mistake",
          className: "secondary",
          onClick: () => {},
        },
      ],
    });
  }

  return (
    // Same min-h as Repair/Paste -- see RepairBox.jsx's comment.
    <Box title="Sale" subtitle="Quick counter sale" className="min-h-[32rem]">
      <form
        className="flex flex-col flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          submitSale(false);
        }}
      >
        <FieldRow>
          <Field label="Name">
            <SuggestInput
              name="name"
              required
              value={form.name}
              onChange={(v) => setField("name", v)}
              endpoint="/api/suggest/names"
            />
          </Field>
          <Field label="Item">
            <FormSelect
              name="item"
              required
              value={form.item}
              onChange={(e) => setField("item", e.target.value)}
            >
              {items.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </FormSelect>
          </Field>
        </FieldRow>
        {form.item === "Other" ? (
          <Field label="Custom item">
            <SuggestInput
              name="custom_item"
              value={form.custom_item}
              onChange={(v) => setField("custom_item", v)}
              endpoint="/api/suggest/sale-custom-items"
            />
          </Field>
        ) : null}
        <FieldRow>
          <Field label="IMEI / Serial">
            <TextInput
              name="serial"
              autoComplete="off"
              value={form.serial}
              onChange={(e) => setField("serial", e.target.value)}
            />
          </Field>
          <Field
            label={
              <>
                Price (<CurrencySymbol />)
              </>
            }
          >
            <TextInput
              name="price"
              inputMode="decimal"
              required
              autoComplete="off"
              value={form.price}
              onChange={(e) => setField("price", e.target.value)}
            />
          </Field>
        </FieldRow>
        <p className="text-sm font-medium mb-1">Payment method</p>
        <div className="flex gap-2 mb-4">
          {["Cash", "Card"].map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setField("method", method)}
              className={`flex-1 rounded-[10px] px-3 py-2 text-sm font-semibold border cursor-pointer ${
                form.method === method
                  ? "bg-ok-bg text-ok border-ok"
                  : "bg-card text-text border-border-strong hover:bg-bg"
              }`}
            >
              {method}
            </button>
          ))}
        </div>
        <p className="text-sm font-medium mb-1">Sale date &amp; time</p>
        <div className="flex gap-2 mb-3">
          {[
            { key: "auto", label: "Automatic" },
            { key: "manual", label: "Manual" },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setDateMode(opt.key)}
              className={`flex-1 rounded-[10px] px-3 py-2 text-sm font-semibold border cursor-pointer ${
                dateMode === opt.key
                  ? "bg-ok-bg text-ok border-ok"
                  : "bg-card text-text border-border-strong hover:bg-bg"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {dateMode === "manual" ? (
          <FieldRow>
            <Field label="Date">
              <TextInput
                type="date"
                max={todayLocalDateString()}
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </Field>
            <Field label="Time">
              <TextInput
                type="time"
                value={saleTime}
                onChange={(e) => setSaleTime(e.target.value)}
              />
            </Field>
          </FieldRow>
        ) : null}
        <PrimaryButton disabled={saving}>Save sale</PrimaryButton>
      </form>
      <StatusMessage confirmation={confirmation} error={error} floating />
    </Box>
  );
});

export default SaleBox;
