import { useEffect, useState } from "react";
import { api } from "../../api";
import { StatusMessage } from "../home/FormBits";
import { ToolsButton, ToolsCard, ToolsField, ToolsInput, ToolsPage } from "./ToolsUi";

// Reads straight from the field's own live value, not a saved copy -- so
// it always opens whatever's actually typed in the box right now, even
// before Save is clicked, and never goes stale once the link is changed.
function OpenLinkButton({ url }) {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  return (
    <a
      href={trimmed}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold border border-border-strong bg-bg text-text no-underline hover:bg-secondary-hover touch-manipulation min-h-11 flex items-center"
    >
      Open ↗
    </a>
  );
}

export default function Website() {
  const [settings, setSettings] = useState(null);
  const [shopWebsiteUrl, setShopWebsiteUrl] = useState("");
  const [trackerSiteUrl, setTrackerSiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/api/tools/shop-settings");
        setSettings(data);
        setShopWebsiteUrl(data.shop_website_url || "");
        setTrackerSiteUrl(data.tracker_site_url || "");
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setConfirmation("");
    setError("");
    try {
      // Every other Shop Details field must ride along untouched -- the
      // save route takes the whole settings row, not a partial patch.
      const saved = await api.put("/api/tools/shop-settings", {
        ...settings,
        shop_website_url: shopWebsiteUrl,
        tracker_site_url: trackerSiteUrl,
      });
      setSettings(saved);
      setConfirmation("Saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ToolsPage title="Shop Website" hint="The two links printed as customer-facing QR codes on receipts.">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:gap-4">
        <ToolsCard>
          <ToolsField
            label="Shop website link"
            hint="Printed as a QR on sale receipts. Customers scan to open your site."
          >
            <div className="flex gap-2">
              <ToolsInput
                autoComplete="off"
                placeholder="https://mobiletechproltd.github.io/Mobile_Tech_Pro_Ltd/"
                value={shopWebsiteUrl}
                onChange={(e) => setShopWebsiteUrl(e.target.value)}
              />
              <OpenLinkButton url={shopWebsiteUrl} />
            </div>
          </ToolsField>
          <ToolsField
            label="Receipt QR Tracker Site"
            hint="The separate repair-tracking site's URL, printed as a QR on intake/collection receipts."
          >
            <div className="flex gap-2">
              <ToolsInput
                autoComplete="off"
                placeholder="Not deployed yet"
                value={trackerSiteUrl}
                onChange={(e) => setTrackerSiteUrl(e.target.value)}
              />
              <OpenLinkButton url={trackerSiteUrl} />
            </div>
          </ToolsField>
          <ToolsButton type="submit" disabled={saving || !settings} className="w-full sm:w-auto">
            {saving ? "Saving…" : "Save"}
          </ToolsButton>
          <StatusMessage confirmation={confirmation} error={error} />
        </ToolsCard>
      </form>
    </ToolsPage>
  );
}
