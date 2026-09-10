import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { CurrencySymbol } from "../../context/ShopContext";
import { useModal } from "../../context/ModalContext";
import { formatDateTime } from "../tools/ToolsUi";
import {
  ActionRow,
  Btn,
  DetailCard,
  Field,
  Input,
  MoneyRow,
  SectionTitle,
  Textarea,
} from "./DetailUi";

export default function PhoneDetail({ phoneId }) {
  const navigate = useNavigate();
  const { showModal } = useModal();
  const fileRef = useRef(null);
  const [phone, setPhone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(null);
  const [formError, setFormError] = useState("");
  const [edit, setEdit] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/phones/${encodeURIComponent(phoneId)}`);
      setPhone(data);
      setPanel(null);
      setFormError("");
      setError("");
    } catch (err) {
      setError(err.message);
      setPhone(null);
    } finally {
      setLoading(false);
    }
  }, [phoneId]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit() {
    setEdit({
      model: phone.model || "",
      price: phone.price_pence != null ? String(phone.price_pence / 100) : "",
      notes: phone.notes || "",
      imei: phone.imei || "",
      listed: !!phone.listed,
    });
    setFormError("");
    setPanel("edit");
  }

  async function saveEdit() {
    setFormError("");
    try {
      const data = await api.patch(`/api/phones/${phone.id}`, edit);
      setPhone(data);
      setPanel(null);
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function toggleListed() {
    try {
      const data = await api.post(`/api/phones/${phone.id}/listed`, {
        listed: !phone.listed,
      });
      setPhone(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onPickImages(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const data = await api.upload(`/api/phones/${phone.id}/images`, form);
      setPhone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(imageId) {
    try {
      const data = await api.del(`/api/phones/${phone.id}/images/${imageId}`);
      setPhone(data);
    } catch (err) {
      setError(err.message);
    }
  }

  function confirmDelete() {
    showModal({
      title: "Remove this phone listing?",
      message: "It will disappear from the public shop page and staff list.",
      buttons: [
        {
          label: "Remove",
          className: "danger",
          onClick: async () => {
            await api.del(`/api/phones/${phone.id}`);
            navigate("/tools/phones");
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  }

  if (loading) {
    return (
      <DetailCard>
        <div className="animate-pulse space-y-3 py-2">
          <div className="h-6 w-2/3 rounded bg-bg" />
          <div className="h-16 rounded-[10px] bg-bg" />
        </div>
      </DetailCard>
    );
  }

  if (!phone) {
    return (
      <div className="rounded-[10px] px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
        {error || "Phone not found."}
      </div>
    );
  }

  const images = phone.images || [];

  return (
    <DetailCard className="pb-6">
      {error ? (
        <div className="mb-3 rounded-[10px] px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="text-[0.72rem] font-semibold uppercase tracking-wide text-ok mb-1">
            Phone for sale
          </div>
          <h2 className="m-0 text-lg sm:text-xl font-semibold tracking-tight">
            {phone.model}
          </h2>
          <div className="text-muted-2 text-[0.75rem] mt-1">
            Updated {formatDateTime(phone.updated_at)}
          </div>
        </div>
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-[0.72rem] font-semibold ${
            phone.listed ? "bg-ok-bg text-ok" : "bg-bg text-muted border border-border-strong"
          }`}
        >
          {phone.listed ? "On shop page" : "Hidden"}
        </span>
      </div>

      <MoneyRow
        items={[
          { label: "Price", value: phone.price_display },
          { label: "IMEI", value: phone.imei || "—" },
          { label: "Photos", value: String(images.length) },
        ]}
      />

      <SectionTitle>Photos</SectionTitle>
      <p className="text-muted text-[0.82rem] -mt-1 mb-2">
        Up to 8 photos (JPG/PNG/WEBP). Shown on the customer shop page.
      </p>
      {images.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {images.map((img) => (
            <div key={img.id} className="relative group rounded-xl overflow-hidden bg-bg border border-border aspect-[4/3]">
              <img
                src={img.url}
                alt=""
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute top-1.5 right-1.5 rounded-lg bg-error text-white text-xs font-semibold px-2 py-1 border-0 cursor-pointer opacity-90 hover:opacity-100"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted text-sm mb-3">No photos yet.</p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={onPickImages}
      />
      <Btn
        variant="secondary"
        disabled={uploading || images.length >= 8}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? "Uploading…" : "+ Add photos"}
      </Btn>

      {phone.notes ? (
        <>
          <SectionTitle>Customer notes</SectionTitle>
          <p className="text-sm m-0 mb-3 whitespace-pre-wrap">{phone.notes}</p>
        </>
      ) : (
        <p className="text-muted text-sm mb-3 mt-3">No customer-facing notes.</p>
      )}

      <ActionRow>
        <Btn variant="secondary" onClick={openEdit}>
          Edit
        </Btn>
        <Btn variant="secondary" onClick={toggleListed}>
          {phone.listed ? "Hide from shop" : "Show on shop"}
        </Btn>
        <Btn variant="danger" onClick={confirmDelete}>
          Remove
        </Btn>
      </ActionRow>

      {panel === "edit" ? (
        <div className="border border-border rounded-[10px] p-3 mt-3 bg-bg">
          <SectionTitle>Edit listing</SectionTitle>
          <Field label="Model">
            <Input
              value={edit.model}
              onChange={(e) => setEdit((ed) => ({ ...ed, model: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
            <Field
              label={
                <>
                  Price (<CurrencySymbol />)
                </>
              }
            >
              <Input
                inputMode="decimal"
                value={edit.price}
                onChange={(e) => setEdit((ed) => ({ ...ed, price: e.target.value }))}
              />
            </Field>
            <Field label="IMEI (staff only)">
              <Input
                value={edit.imei}
                onChange={(e) => setEdit((ed) => ({ ...ed, imei: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Notes for customers">
            <Textarea
              rows={3}
              value={edit.notes}
              onChange={(e) => setEdit((ed) => ({ ...ed, notes: e.target.value }))}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!edit.listed}
              onChange={(e) => setEdit((ed) => ({ ...ed, listed: e.target.checked }))}
            />
            Show on public shop page
          </label>
          <ActionRow>
            <Btn onClick={saveEdit}>Save</Btn>
            <Btn variant="secondary" onClick={() => setPanel(null)}>
              Cancel
            </Btn>
          </ActionRow>
          {formError ? <div className="text-error-text text-sm">{formError}</div> : null}
        </div>
      ) : null}
    </DetailCard>
  );
}
