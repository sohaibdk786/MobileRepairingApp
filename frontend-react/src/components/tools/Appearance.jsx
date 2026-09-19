import { useAppearance } from "../../hooks/useAppearance";
import { ToolsCard, ToolsPage, ToolsToggleRow } from "./ToolsUi";

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

  return (
    <ToolsPage title="Appearance" hint="Theme and accent colour for the app.">
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
