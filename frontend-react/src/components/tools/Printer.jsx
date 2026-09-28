import { useEffect, useState } from "react";
import { api } from "../../api";
import { useModal } from "../../context/ModalContext";
import { connectQz, printReceipt } from "../../lib/printing";
import { StatusMessage } from "../home/FormBits";
import {
  ToolsButton,
  ToolsCard,
  ToolsField,
  ToolsInput,
  ToolsPage,
  ToolsSelect,
  ToolsToggleRow,
} from "./ToolsUi";

const PRINT_METHODS = [
  { value: "qz", label: "QZ Tray" },
  { value: "default_printer", label: "Default printer" },
  { value: "save_pdf", label: "Save to PDF" },
];

const PRINT_DIALOG_MODES = [
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

export default function Printer() {
  const { showModal } = useModal();
  const [current, setCurrent] = useState("Loading…");
  const [printers, setPrinters] = useState([]);
  const [selected, setSelected] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [printMethod, setPrintMethod] = useState("qz");
  const [dialogMode, setDialogMode] = useState("automatic");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qzKey, setQzKey] = useState(null);
  const [qzCertFile, setQzCertFile] = useState(null);
  const [qzKeyFile, setQzKeyFile] = useState(null);
  const [qzMsg, setQzMsg] = useState({ confirmation: "", error: "" });
  const [qzBusy, setQzBusy] = useState(false);

  function loadQzKeyStatus() {
    api
      .get("/api/qz/key/status")
      .then(setQzKey)
      .catch(() => {});
  }

  useEffect(() => {
    api
      .get("/api/tools/shop-settings")
      .then((s) => setCurrent(s.printer_name || "(none yet)"))
      .catch((err) => setError(err.message));
    api
      .get("/api/status")
      .then((s) => {
        setPrintMethod(s.print_method);
        setDialogMode(s.print_dialog_mode);
      })
      .catch(() => {});
    loadQzKeyStatus();
  }, []);

  async function uploadQzKey() {
    if (!qzCertFile || !qzKeyFile) {
      setQzMsg({ confirmation: "", error: "Choose both the certificate and the private key file first" });
      return;
    }
    setQzBusy(true);
    setQzMsg({ confirmation: "", error: "" });
    try {
      const formData = new FormData();
      formData.append("certificate", qzCertFile);
      formData.append("private_key", qzKeyFile);
      const status = await api.upload("/api/qz/key", formData);
      setQzKey(status);
      setQzMsg({ confirmation: "Uploaded.", error: "" });
      setQzCertFile(null);
      setQzKeyFile(null);
    } catch (err) {
      setQzMsg({ confirmation: "", error: err.message });
    } finally {
      setQzBusy(false);
    }
  }

  function removeQzKey() {
    showModal({
      title: "Remove the QZ Tray certificate?",
      message: "QZ Tray printing will stop working until a new certificate is uploaded.",
      buttons: [
        {
          label: "Remove",
          className: "danger",
          onClick: async () => {
            const status = await api.del("/api/qz/key");
            setQzKey(status);
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  }

  async function changePrintMethod(method) {
    setError("");
    try {
      await api.put("/api/tools/print-method", { print_method: method });
      setPrintMethod(method);
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeDialogMode(mode) {
    setError("");
    try {
      await api.put("/api/tools/print-dialog-mode", { print_dialog_mode: mode });
      setDialogMode(mode);
    } catch (err) {
      setError(err.message);
    }
  }

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
    <ToolsPage title="Printer" hint="Choose how receipts print. Applies to every receipt across the app.">
      <ToolsCard title="Printing method">
        <ToolsToggleRow options={PRINT_METHODS} value={printMethod} onChange={changePrintMethod} />
      </ToolsCard>

      <ToolsCard
        title="Print dialog"
        hint="Automatic prints every receipt straight away. Manual shows the print dialog first, every time, so a printer can be picked or confirmed on the spot."
      >
        <ToolsToggleRow options={PRINT_DIALOG_MODES} value={dialogMode} onChange={changeDialogMode} />
      </ToolsCard>

      {printMethod === "qz" ? (
        <ToolsCard
          title="Current printer"
          hint="Needs QZ Tray running. New PC or printer: Detect → pick → Test print."
        >
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
      ) : null}

      {printMethod === "qz" ? (
        <ToolsCard
          title="QZ Tray certificate"
          hint={
            !qzKey
              ? "Loading…"
              : qzKey.valid
                ? `Configured: ${qzKey.subject}`
                : "Not set up yet"
          }
        >
          {qzKey && qzKey.error ? (
            <p className="text-error-text text-sm mb-3">{qzKey.error}</p>
          ) : null}
          <ToolsField label="Certificate file">
            <ToolsInput
              type="file"
              accept=".txt,.crt,.pem,application/x-x509-ca-cert,text/plain"
              onChange={(e) => setQzCertFile(e.target.files?.[0] || null)}
            />
          </ToolsField>
          <ToolsField label="Private key file">
            <ToolsInput
              type="file"
              accept=".pem,application/x-pem-file"
              onChange={(e) => setQzKeyFile(e.target.files?.[0] || null)}
            />
          </ToolsField>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <ToolsButton disabled={qzBusy} onClick={uploadQzKey} className="w-full sm:w-auto">
              Upload
            </ToolsButton>
            {qzKey && qzKey.present ? (
              <ToolsButton variant="danger" disabled={qzBusy} onClick={removeQzKey} className="w-full sm:w-auto">
                Remove
              </ToolsButton>
            ) : null}
          </div>
          <StatusMessage confirmation={qzMsg.confirmation} error={qzMsg.error} />
        </ToolsCard>
      ) : null}

      {printMethod !== "qz" ? (
        <ToolsCard title="Test print">
          <ToolsButton variant="secondary" disabled={busy} onClick={testPrint} className="w-full sm:w-auto">
            Test print
          </ToolsButton>
        </ToolsCard>
      ) : null}

      {showPicker && printMethod === "qz" ? (
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
