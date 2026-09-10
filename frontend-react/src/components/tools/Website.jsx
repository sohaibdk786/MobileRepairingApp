import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { ToolsCard, ToolsPage } from "./ToolsUi";

export default function Website() {
  const [embedUrl, setEmbedUrl] = useState("");
  const [missing, setMissing] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const settings = await api.get("/api/tools/shop-settings");
        const rawUrl = (settings.website_form_url || "").trim();
        if (!rawUrl) {
          setMissing(
            "No form link saved yet — add one in Tools → Shop Details."
          );
          return;
        }
        const url = new URL(rawUrl);
        url.searchParams.set("embedded", "true");
        setEmbedUrl(url.toString());
      } catch (err) {
        setMissing(
          err.message.includes("Invalid URL") || err.name === "TypeError"
            ? "The saved form link doesn't look like a valid URL — check it in Tools → Shop Details."
            : err.message
        );
      }
    })();
  }, []);

  return (
    <ToolsPage
      wide
      title="Shop Website"
      hint="Updates the public site via the linked Google Form."
    >
      <ToolsCard className="overflow-hidden p-0 sm:p-0">
        {missing ? (
          <p className="text-muted text-sm m-0 p-4 sm:p-5">
            {missing}{" "}
            <Link to="/tools/shop-details" className="text-ok no-underline hover:underline">
              Open Shop Details
            </Link>
          </p>
        ) : embedUrl ? (
          <iframe
            title="Shop website form"
            src={embedUrl}
            className="w-full min-h-[70vh] border-0 block"
          />
        ) : (
          <p className="text-muted text-sm m-0 p-4 sm:p-5">Loading…</p>
        )}
      </ToolsCard>
    </ToolsPage>
  );
}
