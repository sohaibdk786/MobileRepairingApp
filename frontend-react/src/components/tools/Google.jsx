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
  const [driveOauth, setDriveOauth] = useState(null);
  const [pending, setPending] = useState(0);
  const [file, setFile] = useState(null);
  const [oauthFile, setOauthFile] = useState(null);
  const [sheets, setSheets] = useState({
    repairs_sheet_id: "",
    shop_details_sheet_id: "",
    drive_folder_id: "",
  });
  const [keyMsg, setKeyMsg] = useState({ confirmation: "", error: "" });
  const [oauthMsg, setOauthMsg] = useState({ confirmation: "", error: "" });
  const [settingsMsg, setSettingsMsg] = useState({ confirmation: "", error: "" });
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  async function loadStatus() {
    const status = await api.get("/api/cloud/status");
    setKey(status.key);
    setDriveOauth(status.drive_oauth);
    setPending(status.sync_queue_pending);
    setSheets({
      repairs_sheet_id: status.repairs_sheet_id || "",
      shop_details_sheet_id: status.shop_details_sheet_id || "",
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

  async function uploadOauthClient() {
    if (!oauthFile) {
      setOauthMsg({ confirmation: "", error: "Choose the client .json file first" });
      return;
    }
    setOauthBusy(true);
    setOauthMsg({ confirmation: "", error: "" });
    try {
      const formData = new FormData();
      formData.append("file", oauthFile);
      const status = await api.upload("/api/cloud/drive-oauth/client", formData);
      setDriveOauth(status);
      setOauthMsg({ confirmation: "Client file uploaded. Click Connect Google Drive next.", error: "" });
      setOauthFile(null);
    } catch (err) {
      setOauthMsg({ confirmation: "", error: err.message });
    } finally {
      setOauthBusy(false);
    }
  }

  function removeOauthClient() {
    showModal({
      title: "Remove the Drive OAuth client?",
      message: "Drive backup will stop working until a client file is uploaded and reconnected.",
      buttons: [
        {
          label: "Remove",
          className: "danger",
          onClick: async () => {
            const status = await api.del("/api/cloud/drive-oauth/client");
            setDriveOauth(status);
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  }

  async function connectDrive() {
    setOauthBusy(true);
    setOauthMsg({ confirmation: "", error: "A Google sign-in window is opening in your browser -- finish it there, then come back." });
    try {
      const status = await api.post("/api/cloud/drive-oauth/connect");
      setDriveOauth(status);
      setOauthMsg({ confirmation: "Connected. Drive backup is ready.", error: "" });
    } catch (err) {
      setOauthMsg({ confirmation: "", error: err.message });
    } finally {
      setOauthBusy(false);
    }
  }

  function disconnectDrive() {
    showModal({
      title: "Disconnect Google Drive?",
      message: "Backups will stop until you click Connect Google Drive again and sign in.",
      buttons: [
        {
          label: "Disconnect",
          className: "danger",
          onClick: async () => {
            const status = await api.post("/api/cloud/drive-oauth/disconnect");
            setDriveOauth(status);
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

  const driveOauthLine = !driveOauth
    ? "Loading…"
    : driveOauth.connected
      ? "Connected -- Drive backup is ready"
      : driveOauth.client_present
        ? "Client file uploaded -- not connected yet"
        : "No client file uploaded yet";

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

      <ToolsCard title="Google Drive backup" hint={driveOauthLine}>
        {driveOauth && driveOauth.error ? (
          <p className="text-error-text text-sm mb-2">{driveOauth.error}</p>
        ) : null}
        {!driveOauth || !driveOauth.connected ? (
          <p className="text-muted text-sm mb-3">
            The service account above can sync Sheets but can&apos;t create the
            backup file on Drive -- it has no storage space of its own. This
            uses your own Google account instead, once, then remembers it.
          </p>
        ) : null}
        {!driveOauth || !driveOauth.client_present ? (
          <ToolsField label="OAuth client file (.json)" hint="Google Cloud Console > APIs & Services > Credentials > a Desktop app client.">
            <ToolsInput
              type="file"
              accept="application/json,.json"
              onChange={(e) => setOauthFile(e.target.files?.[0] || null)}
            />
          </ToolsField>
        ) : null}
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          {!driveOauth || !driveOauth.client_present ? (
            <ToolsButton disabled={oauthBusy} onClick={uploadOauthClient} className="w-full sm:w-auto">
              Upload client file
            </ToolsButton>
          ) : (
            <>
              {!driveOauth.connected ? (
                <ToolsButton disabled={oauthBusy} onClick={connectDrive} className="w-full sm:w-auto">
                  Connect Google Drive
                </ToolsButton>
              ) : (
                <ToolsButton variant="danger" disabled={oauthBusy} onClick={disconnectDrive} className="w-full sm:w-auto">
                  Disconnect
                </ToolsButton>
              )}
              <ToolsButton variant="danger" disabled={oauthBusy} onClick={removeOauthClient} className="w-full sm:w-auto">
                Remove client file
              </ToolsButton>
            </>
          )}
        </div>
        <StatusMessage confirmation={oauthMsg.confirmation} error={oauthMsg.error} />
      </ToolsCard>

      <ToolsCard
        title="Sheet / Drive IDs"
        hint={`Sync queue pending: ${pending}`}
      >
        <form onSubmit={saveSettings}>
          <ToolsField label="Repairs Sheet ID" hint="Customer tracking data -- pushed automatically on every ticket change.">
            <ToolsInput
              value={sheets.repairs_sheet_id}
              onChange={(e) =>
                setSheets((s) => ({ ...s, repairs_sheet_id: e.target.value }))
              }
            />
          </ToolsField>
          <ToolsField label="Shop Details Sheet ID" hint="Pushed to our online sites -- Tools > Shop Details saves here too.">
            <ToolsInput
              value={sheets.shop_details_sheet_id}
              onChange={(e) =>
                setSheets((s) => ({ ...s, shop_details_sheet_id: e.target.value }))
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
