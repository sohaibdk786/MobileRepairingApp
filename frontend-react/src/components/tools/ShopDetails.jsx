import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useShop } from "../../context/ShopContext";
import { StatusMessage } from "../home/FormBits";
import {
  ToolsButton,
  ToolsCard,
  ToolsField,
  ToolsInput,
  ToolsPage,
  ToolsSelect,
  ToolsTextarea,
  ToolsToggleRow,
} from "./ToolsUi";

const empty = {
  shop_name: "",
  address: "",
  manager_name: "",
  manager_phone: "",
  terms_and_conditions: "",
  warranty_days: 0,
  currency_code: "GBP",
  currency_print_style: "sign",
  website_form_url: "",
  public_base_url: "",
};

export default function ShopDetails() {
  const { setShopName, refreshShop } = useShop();
  const [form, setForm] = useState(empty);
  const [currencies, setCurrencies] = useState([]);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const choices = await api.get("/api/currency-choices");
        setCurrencies(choices);
        const settings = await api.get("/api/tools/shop-settings");
        setForm({
          ...empty,
          ...settings,
          warranty_days: settings.warranty_days ?? 0,
          currency_print_style: settings.currency_print_style || "sign",
        });
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setConfirmation("");
    setError("");
    try {
      const saved = await api.put("/api/tools/shop-settings", {
        ...form,
        warranty_days: parseInt(form.warranty_days, 10) || 0,
      });
      if (saved.shop_name) setShopName(saved.shop_name);
      await refreshShop();
      setConfirmation("Shop details saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ToolsPage title="Shop Details" hint="Address, manager, terms, and currency printed on every receipt.">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:gap-4">
        <ToolsCard title="Company" hint="Also editable in Appearance — same name used in the header.">
          <ToolsField
            label="Company name"
            hint={
              <>
                Tip: set brand colour in{" "}
                <Link to="/tools/appearance" className="text-ok underline-offset-2 hover:underline">
                  Appearance
                </Link>
                .
              </>
            }
          >
            <ToolsInput
              required
              autoComplete="organization"
              value={form.shop_name}
              onChange={(e) => setField("shop_name", e.target.value)}
            />
          </ToolsField>
          <ToolsField label="Address">
            <ToolsInput
              required
              autoComplete="street-address"
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
            />
          </ToolsField>
        </ToolsCard>

        <ToolsCard title="Manager contact">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
            <ToolsField label="Manager name">
              <ToolsInput
                required
                autoComplete="name"
                value={form.manager_name}
                onChange={(e) => setField("manager_name", e.target.value)}
              />
            </ToolsField>
            <ToolsField label="Manager phone">
              <ToolsInput
                required
                autoComplete="tel"
                value={form.manager_phone}
                onChange={(e) => setField("manager_phone", e.target.value)}
              />
            </ToolsField>
          </div>
        </ToolsCard>

        <ToolsCard title="Terms & warranty">
          <ToolsField label="Terms & conditions">
            <ToolsTextarea
              rows={4}
              value={form.terms_and_conditions}
              onChange={(e) => setField("terms_and_conditions", e.target.value)}
            />
          </ToolsField>
          <ToolsField label="Warranty (days)">
            <ToolsInput
              type="number"
              min={0}
              required
              value={form.warranty_days}
              onChange={(e) => setField("warranty_days", e.target.value)}
            />
          </ToolsField>
        </ToolsCard>

        <ToolsCard title="Currency" hint="Changes the symbol everywhere — never converts the amount.">
          <ToolsField label="Currency">
            <ToolsSelect
              required
              value={form.currency_code}
              onChange={(e) => setField("currency_code", e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} — {c.code}
                </option>
              ))}
            </ToolsSelect>
          </ToolsField>
          <p className="text-sm font-medium mb-1.5">How it prints on receipts</p>
          <ToolsToggleRow
            value={form.currency_print_style}
            onChange={(v) => setField("currency_print_style", v)}
            options={[
              { value: "sign", label: "Sign" },
              { value: "text", label: "Text" },
            ]}
          />
          <p className="text-muted text-[0.78rem] mb-0">
            Only the printed receipt — screen always shows the real sign.
          </p>
        </ToolsCard>

        <ToolsCard title="Links" hint="Used for Shop Website and customer QR tracking.">
          <ToolsField
            label="Shop website form link"
            hint="Google Form used by Tools → Shop Website. Leave blank to hide it there."
          >
            <ToolsInput
              autoComplete="off"
              placeholder="https://docs.google.com/forms/..."
              value={form.website_form_url || ""}
              onChange={(e) => setField("website_form_url", e.target.value)}
            />
          </ToolsField>
          <ToolsField
            label="Public shop URL (for receipt QR)"
            hint="Example: http://192.168.1.10:8001 — phones on Wi‑Fi must reach this address."
          >
            <ToolsInput
              autoComplete="off"
              placeholder="http://192.168.1.10:8001"
              value={form.public_base_url || ""}
              onChange={(e) => setField("public_base_url", e.target.value)}
            />
          </ToolsField>
        </ToolsCard>

        <ToolsButton type="submit" disabled={saving} className="w-full sm:w-auto sm:self-start">
          {saving ? "Saving…" : "Save shop details"}
        </ToolsButton>
        <StatusMessage confirmation={confirmation} error={error} />
      </form>
    </ToolsPage>
  );
}
