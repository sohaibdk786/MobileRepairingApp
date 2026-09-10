import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useModal } from "../../context/ModalContext";
import { ToolsButton, ToolsCard, ToolsPage, formatDateTime } from "./ToolsUi";

export default function Deleted() {
  const { showModal } = useModal();
  const [repairs, setRepairs] = useState([]);
  const [sales, setSales] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/tools/recently-deleted");
      setRepairs(data.repairs || []);
      setSales(data.sales || []);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = repairs.length + sales.length;

  function purgeAll() {
    showModal({
      title: "Delete everything shown here?",
      message:
        "This permanently removes all of these repairs and sales right now, instead of waiting for the normal 3-day window. This cannot be undone.",
      buttons: [
        {
          label: "Yes, delete all",
          className: "danger",
          onClick: async () => {
            await api.post("/api/tools/recently-deleted/purge-all");
            load();
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  }

  return (
    <ToolsPage
      title="Recently Deleted"
      hint="Restore a repair or sale deleted in the last 3 days."
    >
      {error ? (
        <div className="rounded-xl px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
          {error}
        </div>
      ) : null}

      {total === 0 ? (
        <ToolsCard>
          <p className="text-muted text-sm m-0">Nothing in Recently Deleted.</p>
        </ToolsCard>
      ) : (
        <div>
          <ToolsButton variant="danger" onClick={purgeAll} className="w-full sm:w-auto">
            Delete all permanently
          </ToolsButton>
        </div>
      )}

      {repairs.length > 0 ? (
        <ToolsCard title="Repairs">
          <ul className="m-0 p-0 list-none divide-y divide-border">
            {repairs.map((r) => (
              <DeletedRow
                key={r.ticket}
                label={`${r.ticket} · ${r.name} · ${r.model}`}
                deletedAt={r.deleted_at}
                onRestore={() =>
                  api.post(`/api/repairs/${encodeURIComponent(r.ticket)}/restore`)
                }
                onDone={load}
              />
            ))}
          </ul>
        </ToolsCard>
      ) : null}

      {sales.length > 0 ? (
        <ToolsCard title="Sales">
          <ul className="m-0 p-0 list-none divide-y divide-border">
            {sales.map((s) => (
              <DeletedRow
                key={s.id}
                label={`${s.item} · ${s.name}`}
                deletedAt={s.deleted_at}
                onRestore={() => api.post(`/api/sales/${s.id}/restore`)}
                onDone={load}
              />
            ))}
          </ul>
        </ToolsCard>
      ) : null}
    </ToolsPage>
  );
}

function DeletedRow({ label, deletedAt, onRestore, onDone }) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 py-3 first:pt-0 last:pb-0">
      <span className="text-sm min-w-0">
        {label}{" "}
        <span className="text-muted">deleted {formatDateTime(deletedAt)}</span>
      </span>
      <ToolsButton
        variant="secondary"
        className="!py-2 !px-3 !text-xs w-full sm:w-auto"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onRestore();
            onDone();
          } catch {
            setBusy(false);
          }
        }}
      >
        Restore
      </ToolsButton>
    </li>
  );
}
