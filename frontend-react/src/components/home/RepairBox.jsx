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
  phone: "",
  passcode: "",
  model: "",
  fault: "",
  fault_other: "",
  price: "",
  paid_now: "", // "" = pay later, "Cash" | "Card" = paid full price at drop-off
};

const RepairBox = forwardRef(function RepairBox(_props, ref) {
  const { showModal } = useModal();
  const [faults, setFaults] = useState([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/fault-choices")
      .then((choices) => {
        setFaults(choices);
        setForm((f) => ({ ...f, fault: f.fault || choices[0] || "" }));
      })
      .catch(() => {});
  }, []);

  useImperativeHandle(ref, () => ({
    reset() {
      setForm({ ...empty, fault: faults[0] || "" });
      setConfirmation("");
      setError("");
    },
  }));

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submitRepair(force) {
    if (saving) return;
    if (form.paid_now && !form.price.trim()) {
      setError("Enter a price before marking paid now");
      setConfirmation("");
      return;
    }
    setSaving(true);
    setError("");
    setConfirmation("");
    try {
      const data = await api.post("/api/repairs", { ...form, force: !!force });
      if (data.duplicate) {
        handleDuplicate(data.last_ticket);
        return;
      }
      const paidNote = data.paid_now ? ` · paid ${data.paid_now}` : "";
      try {
        await printReceipt(`/api/repairs/${encodeURIComponent(data.ticket)}/print/intake`);
        setConfirmation(
          `Saved and printed ${data.ticket} (${data.price_display})${paidNote}`
        );
      } catch (printErr) {
        setConfirmation(
          `Saved as ${data.ticket} (${data.price_display})${paidNote} -- but printing failed: ${printErr.message}. Use Reprint to try again.`
        );
      }
      setForm((f) => ({ ...f, paid_now: "" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDuplicate(lastTicket) {
    showModal({
      title: "Same as the last ticket?",
      message: `This looks identical to the last saved ticket (${lastTicket}). What do you want to do?`,
      buttons: [
        {
          label: "Reprint without saving",
          className: "secondary",
          onClick: async () => {
            setForm({ ...empty, fault: faults[0] || "" });
            try {
              await printReceipt(
                `/api/repairs/${encodeURIComponent(lastTicket)}/print/intake`
              );
              setConfirmation(`Reprinted ${lastTicket}. Nothing new saved.`);
            } catch (err) {
              setError(`Could not reprint ${lastTicket}: ${err.message}`);
            }
          },
        },
        {
          label: "Save as a new second ticket",
          onClick: () => submitRepair(true),
        },
        {
          label: "Clear the fields and do not save",
          className: "danger",
          onClick: () => setForm({ ...empty, fault: faults[0] || "" }),
        },
      ],
    });
  }

  return (
    <Box title="Repair" subtitle="New repair ticket">
      <form
        className="flex flex-col flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          submitRepair(false);
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
          <Field label="Phone">
            <SuggestInput
              name="phone"
              value={form.phone}
              onChange={(v) => setField("phone", v)}
              endpoint="/api/suggest/phones"
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Passcode">
            <TextInput
              name="passcode"
              autoComplete="off"
              value={form.passcode}
              onChange={(e) => setField("passcode", e.target.value)}
            />
          </Field>
          <Field label="Model">
            <SuggestInput
              name="model"
              required
              value={form.model}
              onChange={(v) => setField("model", v)}
              endpoint="/api/suggest/models"
            />
          </Field>
        </FieldRow>
        <Field label="Fault">
          <FormSelect
            name="fault"
            required
            value={form.fault}
            onChange={(e) => setField("fault", e.target.value)}
          >
            {faults.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FormSelect>
        </Field>
        {form.fault === "Other" ? (
          <Field label="Other (describe)">
            <SuggestInput
              name="fault_other"
              value={form.fault_other}
              onChange={(v) => setField("fault_other", v)}
              endpoint="/api/suggest/fault-descriptions"
            />
          </Field>
        ) : null}
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
            autoComplete="off"
            placeholder="keep it blank if not agreed yet"
            value={form.price}
            onChange={(e) => setField("price", e.target.value)}
          />
        </Field>
        <p className="text-sm font-medium mb-1">Payment at drop-off</p>
        <div className="flex gap-2 mb-4">
          {[
            { value: "", label: "Pay later" },
            { value: "Cash", label: "Cash" },
            { value: "Card", label: "Card" },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setField("paid_now", opt.value)}
              className={`flex-1 rounded-[10px] px-3 py-2 text-sm font-semibold border cursor-pointer ${
                form.paid_now === opt.value
                  ? "bg-ok-bg text-ok border-ok"
                  : "bg-card text-text border-border-strong hover:bg-bg"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <PrimaryButton disabled={saving}>Save repair ticket</PrimaryButton>
      </form>
      <StatusMessage confirmation={confirmation} error={error} />
    </Box>
  );
});

export default RepairBox;
