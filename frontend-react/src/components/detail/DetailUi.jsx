const controlClass =
  "w-full rounded-[10px] border border-border-strong bg-card px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-[color:var(--accent-focus-ring)] focus:border-ok";

export function DetailCard({ children, className = "" }) {
  return (
    <section
      className={`bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] p-3 sm:p-4 mt-3 sm:mt-4 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children }) {
  return (
    <div className="text-[0.72rem] font-semibold uppercase tracking-wide text-muted mt-4 sm:mt-5 mb-2">
      {children}
    </div>
  );
}

export function MoneyRow({ items }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 my-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-[10px] p-2.5 sm:p-3.5 text-center ${
            item.emphasize ? "bg-warn-bg ring-1 ring-[color:var(--warn-text)]/20" : "bg-bg"
          }`}
        >
          <div className="text-muted text-[0.65rem] sm:text-[0.72rem] font-semibold uppercase tracking-wide">
            {item.label}
          </div>
          <div
            className={`text-base sm:text-[1.3rem] font-bold mt-0.5 tabular-nums ${
              item.emphasize ? "text-warn-text" : ""
            }`}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActionRow({ children }) {
  return <div className="flex flex-wrap gap-2 my-3">{children}</div>;
}

export function Btn({ children, variant = "primary", size = "md", className = "", ...rest }) {
  const base =
    "rounded-[10px] font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors touch-manipulation";
  const sizes =
    size === "sm"
      ? "px-2.5 py-2 text-xs min-h-9"
      : size === "lg"
        ? "px-4 py-3 text-sm min-h-11"
        : "px-3 py-2.5 text-sm min-h-10";
  const variants = {
    primary: "bg-ok text-white hover:bg-accent-dark",
    secondary: "bg-bg text-text border border-border-strong hover:bg-secondary-hover",
    danger: "bg-error text-white hover:bg-error-dark",
  };
  return (
    <button
      type="button"
      className={`${base} ${sizes} ${variants[variant] || variants.primary} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`block text-sm font-medium mb-3 ${className}`}>
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

export function Input(props) {
  return <input {...props} className={`${controlClass} ${props.className || ""}`} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${controlClass} ${props.className || ""}`}>
      {children}
    </select>
  );
}

export function Textarea(props) {
  return <textarea {...props} className={`${controlClass} ${props.className || ""}`} />;
}

export function statusSlug(status) {
  return (
    "status-" +
    status
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

export function statusBadgeClass(status) {
  const slug = statusSlug(status);
  const map = {
    "status-received": "bg-bg text-text border border-border-strong",
    "status-in-progress": "bg-info-bg text-info-text",
    "status-ready": "bg-warn-bg text-warn-text",
    "status-collected": "bg-ok-bg text-ok",
    "status-not-agreed-fixed-in-shop": "bg-error-bg text-error-text",
    "status-not-agreed-fixed-collected": "bg-error-bg text-error-text",
  };
  return map[slug] || "bg-bg text-text";
}

export function formatTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const COLLECTED_STATUSES = ["Collected", "Not Agreed/Fixed - Collected"];

/** Primary counter journey — shown as large step buttons. */
export const PRIMARY_STATUSES = ["Received", "In Progress", "Ready", "Collected"];

/** Staff hints if /api/status-hints is unavailable (stale proxy / old backend). */
export const STATUS_HINTS_FALLBACK = {
  Received: "Device taken in",
  "In Progress": "Working on the repair",
  Ready: "Ready to hand over",
  Collected: "Customer collected + paid",
  "Not Agreed/Fixed - In Shop": "Not repaired — still here",
  "Not Agreed/Fixed - Collected": "Not repaired — collected",
};

export function journeyStepIndex(status) {
  if (status === "Received") return 1;
  if (status === "In Progress") return 2;
  if (status === "Ready" || status === "Not Agreed/Fixed - In Shop") return 3;
  if (COLLECTED_STATUSES.includes(status)) return 4;
  return 2;
}
