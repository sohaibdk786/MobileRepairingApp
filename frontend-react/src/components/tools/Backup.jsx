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
  formatDateTime,
} from "./ToolsUi";

export default function Backup() {
  const { showModal } = useModal();
  const [lastBackup, setLastBackup] = useState("…");
  const [backupMsg, setBackupMsg] = useState({ confirmation: "", error: "" });
  const [dbFile, setDbFile] = useState(null);
  const [dbMsg, setDbMsg] = useState({ confirmation: "", error: "" });
  const [sheetId, setSheetId] = useState("");
  const [sheetMsg, setSheetMsg] = useState({ confirmation: "", error: "" });
  const [busy, setBusy] = useState(false);

  async function loadLast() {
    const status = await api.get("/api/cloud/status");
    setLastBackup(
      status.last_backup_at ? formatDateTime(status.last_backup_at) : "Never"
    );
  }

  useEffect(() => {
    loadLast().catch(() => setLastBackup("Unknown"));
  }, []);

  async function backupNow() {
    setBusy(true);
    setBackupMsg({ confirmation: "", error: "" });
    try {
      const result = await api.post("/api/cloud/backup-now");
      setBackupMsg({ confirmation: result.message, error: "" });
      await loadLast();
    } catch (err) {
      setBackupMsg({ confirmation: "", error: err.message });
    } finally {
      setBusy(false);
    }
  }

  function restoreDb() {
    if (!dbFile) {
      setDbMsg({ confirmation: "", error: "Choose a .db file first" });
      return;
    }
    showModal({
      title: "Replace the current database?",
      message:
        "The current database is kept as a timestamped backup file first, but everything saved after that point will no longer be what's active. This cannot be undone from here.",
      buttons: [
        {
          label: "Replace it",
          className: "danger",
          onClick: async () => {
            setBusy(true);
            setDbMsg({ confirmation: "", error: "" });
            try {
              const formData = new FormData();
              formData.append("file", dbFile);
              const res = await fetch("/api/cloud/restore/db", {
                method: "POST",
                body: formData,
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.detail || "Restore failed");
              setDbMsg({ confirmation: data.message, error: "" });
            } catch (err) {
              setDbMsg({ confirmation: "", error: err.message });
            } finally {
              setBusy(false);
            }
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  }

  async function importSheet() {
    if (!sheetId.trim()) {
      setSheetMsg({ confirmation: "", error: "Enter a Sheet ID first" });
      return;
    }
    setBusy(true);
    setSheetMsg({ confirmation: "", error: "" });
    try {
      const result = await api.post("/api/cloud/restore/sheet", {
        sheet_id: sheetId.trim(),
      });
      setSheetMsg({ confirmation: result.message, error: "" });
    } catch (err) {
      setSheetMsg({ confirmation: "", error: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolsPage
      title="Backup & Restore"
      hint="Manual Drive backup, restore from .db or Sheet, CSV export."
    >
      <ToolsCard title="Drive backup" hint={`Last backup: ${lastBackup}`}>
        <ToolsButton disabled={busy} onClick={backupNow} className="w-full sm:w-auto">
          Backup now
        </ToolsButton>
        <StatusMessage
          confirmation={backupMsg.confirmation}
          error={backupMsg.error}
        />
      </ToolsCard>

      <ToolsCard title="Restore from .db" hint="Replaces the current database. Confirm carefully.">
        <ToolsField label="Database file">
          <ToolsInput
            type="file"
            accept=".db,application/octet-stream"
            onChange={(e) => setDbFile(e.target.files?.[0] || null)}
          />
        </ToolsField>
        <ToolsButton variant="danger" disabled={busy} onClick={restoreDb} className="w-full sm:w-auto">
          Restore database
        </ToolsButton>
        <StatusMessage confirmation={dbMsg.confirmation} error={dbMsg.error} />
      </ToolsCard>

      <ToolsCard title="Import from Sheet">
        <ToolsField label="Sheet ID">
          <ToolsInput value={sheetId} onChange={(e) => setSheetId(e.target.value)} />
        </ToolsField>
        <ToolsButton disabled={busy} onClick={importSheet} className="w-full sm:w-auto">
          Import from Sheet
        </ToolsButton>
        <StatusMessage
          confirmation={sheetMsg.confirmation}
          error={sheetMsg.error}
        />
      </ToolsCard>

      <ToolsCard title="CSV export">
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <a
            className="rounded-xl px-4 py-2.5 text-sm font-semibold no-underline bg-bg text-text border border-border-strong hover:bg-secondary-hover text-center min-h-11 inline-flex items-center justify-center"
            href="/api/cloud/export/repairs.csv"
            download
          >
            Export repairs.csv
          </a>
          <a
            className="rounded-xl px-4 py-2.5 text-sm font-semibold no-underline bg-bg text-text border border-border-strong hover:bg-secondary-hover text-center min-h-11 inline-flex items-center justify-center"
            href="/api/cloud/export/sales.csv"
            download
          >
            Export sales.csv
          </a>
        </div>
      </ToolsCard>
    </ToolsPage>
  );
}
