import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useShop } from "../../context/ShopContext";
import { StatusMessage } from "../home/FormBits";
import {
  ToolsButton,
  ToolsCard,
  ToolsField,
  ToolsInput,
  ToolsPage,
  ToolsTextarea,
} from "./ToolsUi";

export default function Phones() {
  const navigate = useNavigate();
  const { refreshShop } = useShop();
  const [phones, setPhones] = useState([]);
  const [shopUrl, setShopUrl] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    model: "",
    price: "",
    notes: "",
    imei: "",
    listed: true,
  });

  const load = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([
        api.get("/api/phones"),
        api.get("/api/tools/shop-settings"),
      ]);
      setPhones(list);
      const base = (settings.public_base_url || "").replace(/\/$/, "");
      setShopUrl(base ? `${base}/shop` : `${window.location.origin}/shop`);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function savePhone(e) {
    e.preventDefault();
    setSaving(true);
    setConfirmation("");
    setError("");
    try {
      const phone = await api.post("/api/phones", form);
      setConfirmation(`Listed ${phone.model}. Add photos on the detail page.`);
      setForm({ model: "", price: "", notes: "", imei: "", listed: true });
      setShowForm(false);
      await load();
      navigate(`/detail?type=phone&id=${phone.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleListed(phone) {
    try {
      await api.post(`/api/phones/${phone.id}/listed`, { listed: !phone.listed });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <ToolsPage
      wide
      title="Phones for sale"
      hint="List mobiles on the public shop page (customer QR). IMEI stays private."
    >
      <ToolsCard
        title="Customer shop page"
        hint="Set Public shop URL in Shop Details so phones can open this link."
      >
        <p className="text-sm m-0 mb-3 break-all">
          <a
            href={shopUrl}
            target="_blank"
            rel="noreferrer"
            className="text-ok underline underline-offset-2"
          >
            {shopUrl || "/shop"}
          </a>
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <ToolsButton
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => window.open(shopUrl || "/shop", "_blank")}
          >
            Open shop page
          </ToolsButton>
          <ToolsButton
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={async () => {
              try {
                const { printReceipt } = await import("../../lib/printing");
                await printReceipt("/api/tools/print-shop-qr");
                setConfirmation("Shop QR sent to printer.");
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            Print shop QR
          </ToolsButton>
          <Link
            to="/tools/shop-details"
            className="rounded-xl px-4 py-2.5 text-sm font-semibold no-underline bg-bg text-text border border-border-strong hover:bg-secondary-hover text-center min-h-11 inline-flex items-center justify-center"
          >
            Shop Details
          </Link>
        </div>
      </ToolsCard>

      <div className="flex flex-col sm:flex-row gap-2">
        <ToolsButton
          className="w-full sm:w-auto"
          onClick={() => {
            setShowForm((v) => !v);
            setConfirmation("");
            setError("");
          }}
        >
          {showForm ? "Cancel" : "+ List a phone"}
        </ToolsButton>
        <ToolsButton variant="secondary" className="w-full sm:w-auto" onClick={() => refreshShop() || load()}>
          Refresh
        </ToolsButton>
      </div>

      {showForm ? (
        <ToolsCard title="New phone listing">
          <form onSubmit={savePhone}>
            <ToolsField label="Model">
              <ToolsInput
                required
                placeholder="e.g. iPhone 13 128GB Blue"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              />
            </ToolsField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
              <ToolsField label="Price">
                <ToolsInput
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </ToolsField>
              <ToolsField label="IMEI (staff only)">
                <ToolsInput
                  placeholder="optional — not shown publicly"
                  value={form.imei}
                  onChange={(e) => setForm((f) => ({ ...f, imei: e.target.value }))}
                />
              </ToolsField>
            </div>
            <ToolsField label="Notes for customers">
              <ToolsTextarea
                rows={2}
                placeholder="Condition, accessories, warranty…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </ToolsField>
            <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.listed}
                onChange={(e) => setForm((f) => ({ ...f, listed: e.target.checked }))}
              />
              Show on public shop page
            </label>
            <ToolsButton type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "Saving…" : "Save phone"}
            </ToolsButton>
          </form>
        </ToolsCard>
      ) : null}

      <StatusMessage confirmation={confirmation} error={error} />

      <ToolsCard title="Stock" hint={`${phones.length} phone${phones.length === 1 ? "" : "s"}`}>
        {phones.length === 0 ? (
          <p className="text-muted text-sm m-0">No phones listed yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {phones.map((p) => (
              <article
                key={p.id}
                className="rounded-2xl border border-border bg-bg overflow-hidden flex flex-col min-h-0 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              >
                <button
                  type="button"
                  className="p-0 border-0 bg-transparent cursor-pointer touch-manipulation text-left"
                  onClick={() => navigate(`/detail?type=phone&id=${p.id}`)}
                >
                  <div className="relative aspect-square bg-card overflow-hidden">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                        No photo
                      </div>
                    )}
                    {(p.images || []).length > 1 ? (
                      <div className="absolute bottom-1.5 inset-x-0 flex justify-center gap-1">
                        {(p.images || []).slice(0, 5).map((img, i) => (
                          <span
                            key={img.id}
                            className={`w-1.5 h-1.5 rounded-full ${
                              i === 0 ? "bg-white" : "bg-white/55"
                            } shadow`}
                          />
                        ))}
                      </div>
                    ) : null}
                    <span
                      className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                        p.listed
                          ? "bg-ok-bg text-ok"
                          : "bg-card/90 text-muted border border-border"
                      }`}
                    >
                      {p.listed ? "Live" : "Hidden"}
                    </span>
                  </div>
                  <div className="p-2.5 sm:p-3">
                    <div className="font-semibold text-sm leading-snug line-clamp-2 min-h-[2.5em]">
                      {p.model}
                    </div>
                    <div className="text-ok font-bold text-[0.95rem] mt-1">
                      {p.price_display}
                    </div>
                    <div className="text-muted text-[0.72rem] mt-0.5">
                      {(p.images || []).length
                        ? `${(p.images || []).length} photo${(p.images || []).length === 1 ? "" : "s"}`
                        : "No photos"}
                    </div>
                  </div>
                </button>
                <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 flex gap-2 mt-auto">
                  <ToolsButton
                    variant="secondary"
                    className="!py-2 !px-2 !text-xs flex-1"
                    onClick={() => toggleListed(p)}
                  >
                    {p.listed ? "Hide" : "Show"}
                  </ToolsButton>
                  <ToolsButton
                    variant="secondary"
                    className="!py-2 !px-2 !text-xs flex-1"
                    onClick={() => navigate(`/detail?type=phone&id=${p.id}`)}
                  >
                    Open
                  </ToolsButton>
                </div>
              </article>
            ))}
          </div>
        )}
      </ToolsCard>
    </ToolsPage>
  );
}
