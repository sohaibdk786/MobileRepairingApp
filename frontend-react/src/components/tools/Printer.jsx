import { useEffect, useState } from "react";
import { api } from "../../api";
import { connectQz, printReceipt } from "../../lib/printing";
import { StatusMessage } from "../home/FormBits";
import {
  ToolsButton,
  ToolsCard,
  ToolsField,
  ToolsPage,
  ToolsSelect,
} from "./ToolsUi";

export default function Printer() {
  const [current, setCurrent] = useState("Loading…");
  const [printers, setPrinters] = useState([]);
  const [selected, setSelected] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/api/tools/shop-settings")
      .then((s) => setCurrent(s.printer_name || "(none yet)"))
      .catch((err) => setError(err.message));
  }, []);

  async function detect() {
    setBusy(true);
    setError("");
    try {
      await connectQz();
      const qz = window.qz;
      const list = await qz.printers.find();
      setPrinters(list);
      setSelected(list[0] || "");
      setShowPicker(true);
    } catch (err) {
      setError(
        `Could not detect printers: ${err.message} — is QZ Tray installed and running?`
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const settings = await api.put("/api/tools/printer", {
        printer_name: selected,
      });
      setCurrent(settings.printer_name);
      setConfirmation(`Printer saved: ${settings.printer_name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function testPrint() {
    setBusy(true);
    setError("");
    try {
      await printReceipt("/api/tools/test-print");
      setConfirmation("Test print sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolsPage
      title="Printer"
      hint="Needs QZ Tray running. New PC or printer: Detect → pick → Test print."
    >
      <ToolsCard title="Current printer">
        <p className="text-sm m-0 mb-4">
          Selected: <strong className="font-semibold">{current}</strong>
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <ToolsButton variant="secondary" disabled={busy} onClick={detect} className="w-full sm:w-auto">
            Detect printers
          </ToolsButton>
          <ToolsButton variant="secondary" disabled={busy} onClick={testPrint} className="w-full sm:w-auto">
            Test print
          </ToolsButton>
        </div>
      </ToolsCard>

      {showPicker ? (
        <ToolsCard title="Choose printer" hint="Pick the till printer, then save.">
          <ToolsField label="Available printers">
            <ToolsSelect value={selected} onChange={(e) => setSelected(e.target.value)}>
              {printers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </ToolsSelect>
          </ToolsField>
          <ToolsButton disabled={busy || !selected} onClick={save} className="w-full sm:w-auto">
            Save selected printer
          </ToolsButton>
        </ToolsCard>
      ) : null}

      <StatusMessage confirmation={confirmation} error={error} />
    </ToolsPage>
  );
}
