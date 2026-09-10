const controlClass =
  "w-full rounded-[10px] border border-border-strong bg-card px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-[color:var(--accent-focus-ring)] focus:border-ok";

export function Box({ title, subtitle, children }) {
  return (
    <section className="bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] p-4 flex flex-col min-h-0">
      <h2 className="mt-0 mb-1 text-[1.05rem] font-semibold">{title}</h2>
      {subtitle ? <p className="text-muted text-sm mt-0 mb-3">{subtitle}</p> : null}
      {children}
    </section>
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

export function FieldRow({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">{children}</div>;
}

export function TextInput({ className = "", ...rest }) {
  return <input {...rest} className={`${controlClass} ${className}`} />;
}

export function FormSelect({ className = "", children, ...rest }) {
  return (
    <select {...rest} className={`${controlClass} ${className}`}>
      {children}
    </select>
  );
}

export function FormTextarea({ className = "", ...rest }) {
  return <textarea {...rest} className={`${controlClass} min-h-28 ${className}`} />;
}

export function PrimaryButton({ children, className = "", ...rest }) {
  return (
    <button
      type="submit"
      className={`w-full mt-auto rounded-[10px] bg-ok text-white font-semibold px-3 py-2.5 text-sm border-0 cursor-pointer hover:bg-accent-dark disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function StatusMessage({ confirmation, error }) {
  return (
    <>
      {confirmation ? (
        <div className="mt-3 rounded-xl px-3 py-2.5 text-sm font-medium bg-ok-bg text-ok">
          {confirmation}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-xl px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
          {error}
        </div>
      ) : null}
    </>
  );
}
