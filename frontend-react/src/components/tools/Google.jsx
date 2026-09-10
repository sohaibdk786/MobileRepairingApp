import { useEffect, useState } from "react";
import { api } from "../../api";
import { useModal } from "../../context/ModalContext";
import { StatusMessage } from "../home/FormBits";
import {
  ToolsButton,
  ToolsCard,
  ToolsField,
  ToolsInput,
  ToolsPage,
} from "./ToolsUi";

export default function Google() {
  const { showModal } = useModal();
  const [key, setKey] = useState(null);
  const [pending, setPending] = useState(0);
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState({
    repairs_sheet_id: "",
    sales_sheet_id: "",
    drive_folder_id: "",
  });
  const [keyMsg, setKeyMsg] = useState({ confirmation: "", error: "" });
  const [settingsMsg, setSettingsMsg] = useState({ confirmation: "", error: "" });
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    const status = await api.get("/api/cloud/status");
    setKey(status.key);
    setPending(status.sync_queue_pending);
    setSheets({
      repairs_sheet_id: status.repairs_sheet_id || "",
      sales_sheet_id: status.sales_sheet_id || "",
      drive_folder_id: status.drive_folder_id || "",
    });
  }

  useEffect(() => {
    loadStatus().catch((err) => setKeyMsg({ confirmation: "", error: err.message }));
  }, []);

  async function uploadKey() {
    if (!file) {
      setKeyMsg({ confirmation: "", error: "Choose a .json key file first" });
      return;
    }
    setBusy(true);
    setKeyMsg({ confirmation: "", error: "" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cloud/key", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setKey(data);
      setKeyMsg({ confirmation: "Key uploaded.", error: "" });
      setFile(null);
    } catch (err) {
      setKeyMsg({ confirmation: "", error: err.message });
    } finally {
      setBusy(false);
    }
  }

  function removeKey() {
    showModal({
      title: "Remove the Google key?",
      message: "Sync and backup will stop working until a new key is uploaded.",
      buttons: [
        {
          label: "Remove",
          className: "danger",
          onClick: async () => {
            const status = await api.del("/api/cloud/key");
            setKey(status);
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSettingsMsg({ confirmation: "", error: "" });
    try {
      await api.put("/api/cloud/settings", sheets);
      setSettingsMsg({ confirmation: "Saved.", error: "" });
    } catch (err) {
      setSettingsMsg({ confirmation: "", error: err.message });
    }
  }

  const keyLine = !key
    ? "Loading…"
    : key.valid
      ? `Connected as ${key.client_email}`
      : key.present
        ? "Key file found, but not working"
        : "Google connection key not found";

  return (
    <ToolsPage
      title="Google Connection"
      hint="Service account key and Sheet/Drive IDs for sync and backup."
    >
      <ToolsCard title="Service account key" hint={keyLine}>
        {key && !key.valid && key.error ? (
          <p className="text-error-text text-sm mb-2">{key.error}</p>
        ) : null}
        {key && !key.valid ? (
          <p className="text-muted text-sm mb-3">
            Upload a Google Cloud service-account JSON key, then share your
            Sheets and Drive folder with that account&apos;s email.
          </p>
        ) : null}
        <ToolsField label="Key file (.json)">
          <ToolsInput
            type="file"
            accept="application/json,.json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </ToolsField>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <ToolsButton disabled={busy} onClick={uploadKey} className="w-full sm:w-auto">
            Upload / replace key
          </ToolsButton>
          <ToolsButton variant="danger" onClick={removeKey} className="w-full sm:w-auto">
            Remove key
          </ToolsButton>
        </div>
        <StatusMessage confirmation={keyMsg.confirmation} error={keyMsg.error} />
      </ToolsCard>

      <ToolsCard
        title="Sheet / Drive IDs"
        hint={`Sync queue pending: ${pending}`}
      >
        <form onSubmit={saveSettings}>
          <ToolsField label="Repairs Sheet ID">
            <ToolsInput
              value={sheets.repairs_sheet_id}
              onChange={(e) =>
                setSheets((s) => ({ ...s, repairs_sheet_id: e.target.value }))
              }
            />
          </ToolsField>
          <ToolsField label="Sales Sheet ID">
            <ToolsInput
              value={sheets.sales_sheet_id}
              onChange={(e) =>
                setSheets((s) => ({ ...s, sales_sheet_id: e.target.value }))
              }
            />
          </ToolsField>
          <ToolsField label="Drive folder ID">
            <ToolsInput
              value={sheets.drive_folder_id}
              onChange={(e) =>
                setSheets((s) => ({ ...s, drive_folder_id: e.target.value }))
              }
            />
          </ToolsField>
          <ToolsButton type="submit" className="w-full sm:w-auto">
            Save Sheet / Drive IDs
          </ToolsButton>
        </form>
        <StatusMessage
          confirmation={settingsMsg.confirmation}
          error={settingsMsg.error}
        />
      </ToolsCard>
    </ToolsPage>
  );
}
