import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAppearance } from "../../hooks/useAppearance";
import { StatusMessage } from "../home/FormBits";
import { ToolsCard, ToolsPage, ToolsToggleRow } from "./ToolsUi";

const MODES = [
  { value: "test", label: "Test" },
  { value: "live", label: "Live" },
];

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
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/status")
      .then((s) => setMode(s.mode))
      .catch(() => {});
  }, []);

  async function changeMode(next) {
    setError("");
    try {
      await api.put("/api/tools/mode", { mode: next });
      // Full reload, not just local state -- every other screen (shop
      // name, printer, everything) reads from whichever database this
      // just switched to, so a plain state update would leave it stale.
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <ToolsPage title="Appearance" hint="Theme and accent colour for the app.">
      <ToolsCard title="Mode" hint="Switches which database is in use -- everything else stays the same.">
        <ToolsToggleRow options={MODES} value={mode} onChange={changeMode} />
        <StatusMessage error={error} />
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
