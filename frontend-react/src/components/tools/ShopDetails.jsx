import { useEffect, useState } from "react";
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
  receipt_phone: "",
  public_phone: "",
  terms_and_conditions: "",
  warranty_days: 0,
  currency_code: "GBP",
  currency_print_style: "sign",
  email: "",
  maps_url: "",
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
        <ToolsCard title="Company" hint="Shown in the header and printed on every receipt.">
          <ToolsField label="Company name">
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

        <ToolsCard
          title="Receipt contact"
          hint="Printed on every paper receipt: intake, collection, sale, and the shop QR."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
            <ToolsField label="Manager name">
              <ToolsInput
                required
                autoComplete="name"
                value={form.manager_name}
                onChange={(e) => setField("manager_name", e.target.value)}
              />
            </ToolsField>
            <ToolsField label="Receipt phone">
              <ToolsInput
                autoComplete="tel"
                value={form.receipt_phone}
                onChange={(e) => setField("receipt_phone", e.target.value)}
              />
            </ToolsField>
          </div>
        </ToolsCard>

        <ToolsCard
          title="Contact & location"
          hint="Pushed to the Shop Details Sheet on every save -- not on paper receipts."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
            <ToolsField
              label="Public phone"
              hint="Shown on the tracking page and shop catalogue. Use international format (e.g. +447344544184) -- the business card builds a WhatsApp link from this."
            >
              <ToolsInput
                autoComplete="tel"
                value={form.public_phone}
                onChange={(e) => setField("public_phone", e.target.value)}
              />
            </ToolsField>
            <ToolsField label="Email address" hint="Pushed to the Sheet -- no site reads it yet.">
              <ToolsInput
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
              />
            </ToolsField>
            <ToolsField label="Google Maps link" hint="Pushed to the Sheet -- no site reads it yet.">
              <ToolsInput
                autoComplete="off"
                placeholder="https://maps.app.goo.gl/..."
                value={form.maps_url}
                onChange={(e) => setField("maps_url", e.target.value)}
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

        <ToolsButton type="submit" disabled={saving} className="w-full sm:w-auto sm:self-start">
          {saving ? "Saving…" : "Save shop details"}
        </ToolsButton>
        <StatusMessage confirmation={confirmation} error={error} />
      </form>
    </ToolsPage>
  );
}
