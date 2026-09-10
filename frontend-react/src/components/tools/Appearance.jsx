import { useEffect, useState } from "react";
import { api } from "../../api";
import { useShop } from "../../context/ShopContext";
import { useAppearance } from "../../hooks/useAppearance";
import { StatusMessage } from "../home/FormBits";
import {
  ToolsButton,
  ToolsCard,
  ToolsField,
  ToolsInput,
  ToolsPage,
  ToolsToggleRow,
} from "./ToolsUi";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const ACCENTS = [
  "green",
  "blue",
  "red",
  "cyan",
  "purple",
  "orange",
  "indigo",
  "pink",
].map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export default function Appearance() {
  const { theme, setTheme, accent, setAccent } = useAppearance();
  const { shopName, setShopName, refreshShop } = useShop();
  const [companyName, setCompanyName] = useState(shopName || "");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCompanyName(shopName || "");
  }, [shopName]);

  async function saveCompanyName(e) {
    e.preventDefault();
    const next = companyName.trim();
    if (!next) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setConfirmation("");
    setError("");
    try {
      const settings = await api.get("/api/tools/shop-settings");
      await api.put("/api/tools/shop-settings", {
        ...settings,
        shop_name: next,
      });
      setShopName(next);
      await refreshShop();
      setConfirmation("Company name saved — used in the header and on receipts.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ToolsPage
      title="Appearance"
      hint="Brand, theme, and accent — company name shows in the header and on every receipt."
    >
      <ToolsCard
        title="Company name"
        hint="This is your shop brand everywhere in the app and on printed receipts."
      >
        <form onSubmit={saveCompanyName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <ToolsField label="Display name">
              <ToolsInput
                required
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. DropFix Limited"
              />
            </ToolsField>
          </div>
          <ToolsButton type="submit" disabled={saving} className="sm:mb-3 w-full sm:w-auto shrink-0">
            {saving ? "Saving…" : "Save name"}
          </ToolsButton>
        </form>
        <StatusMessage confirmation={confirmation} error={error} />
      </ToolsCard>

      <ToolsCard title="Theme" hint="System follows your device setting automatically.">
        <ToolsToggleRow options={THEMES} value={theme} onChange={setTheme} />
      </ToolsCard>

      <ToolsCard
        title="Accent colour"
        hint="Changes the app colour everywhere. Green is the default."
      >
        <ToolsToggleRow options={ACCENTS} value={accent} onChange={setAccent} />
      </ToolsCard>
    </ToolsPage>
  );
}
