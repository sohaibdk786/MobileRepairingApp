import { Link } from "react-router-dom";

export function ToolsBack() {
  return (
    <Link
      to="/tools"
      className="inline-flex items-center gap-1.5 text-sm text-muted no-underline hover:text-ok mb-3 touch-manipulation"
    >
      <span aria-hidden>←</span> Tools
    </Link>
  );
}

export function ToolsPage({ title, hint, children, wide = false }) {
  return (
    <div className="w-full">
      <ToolsBack />
      <header className="mb-4 sm:mb-5">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mt-0 mb-1">
          {title}
        </h2>
        {hint ? (
          <p className="text-muted text-sm mt-0 mb-0 leading-relaxed">{hint}</p>
        ) : null}
      </header>
      <div className={`flex flex-col gap-3 sm:gap-4 ${wide ? "" : "max-w-3xl"}`}>
        {children}
      </div>
    </div>
  );
}

export function ToolsCard({ children, className = "", title, hint }) {
  return (
    <section
      className={`bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] p-4 sm:p-5 ${className}`}
    >
      {title ? (
        <div className="mb-3 sm:mb-4">
          <h3 className="m-0 text-sm font-semibold tracking-tight">{title}</h3>
          {hint ? (
            <p className="m-0 mt-1 text-muted text-[0.82rem] leading-snug">{hint}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const inputClass =
  "w-full rounded-xl border border-border-strong bg-bg sm:bg-card px-3.5 py-2.5 text-sm text-text outline-none transition-shadow focus:ring-2 focus:ring-[color:var(--accent-focus-ring)] focus:border-ok touch-manipulation min-h-11";

export function ToolsField({ label, children, hint }) {
  return (
    <label className="block text-sm font-medium mb-3 last:mb-0">
      <span className="block mb-1.5 text-text">{label}</span>
      {children}
      {hint ? (
        <span className="block mt-1.5 text-muted text-[0.78rem] font-normal leading-snug">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function ToolsInput(props) {
  return <input {...props} className={`${inputClass} ${props.className || ""}`} />;
}

export function ToolsSelect({ children, ...props }) {
  return (
    <select {...props} className={`${inputClass} ${props.className || ""}`}>
      {children}
    </select>
  );
}

export function ToolsTextarea(props) {
  return (
    <textarea
      {...props}
      className={`${inputClass} min-h-[6rem] resize-y ${props.className || ""}`}
    />
  );
}

export function ToolsButton({
  children,
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}) {
  const styles =
    variant === "danger"
      ? "bg-error text-white hover:bg-error-dark"
      : variant === "secondary"
        ? "bg-bg text-text border border-border-strong hover:bg-secondary-hover"
        : "bg-ok text-white hover:bg-accent-dark";
  return (
    <button
      type={type}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold border-0 cursor-pointer disabled:opacity-50 touch-manipulation min-h-11 transition-colors ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ToolsToggleRow({ options, value, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold border cursor-pointer touch-manipulation min-h-11 transition-colors ${
              active
                ? "bg-ok-bg text-ok border-ok shadow-sm"
                : "bg-bg text-text border-border-strong hover:bg-secondary-hover"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function formatDateTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hh}:${mm}`;
}
