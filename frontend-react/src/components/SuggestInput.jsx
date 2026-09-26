import { useEffect, useRef, useState } from "react";
import { api } from "../api";

/** Suggest-from-shop-history input (ported from frontend/suggest.js). */
export default function SuggestInput({
  value,
  onChange,
  endpoint,
  name,
  required,
  className = "",
  ...rest
}) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  // Persists across renders (a plain closure var, re-created every effect
  // run, never actually debounced anything -- every keystroke fired its
  // own lookup instead of waiting for a pause in typing).
  const timerRef = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    const q = (value || "").trim();
    if (!q) {
      setItems([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const results = await api.get(`${endpoint}?q=${encodeURIComponent(q)}`);
        if (inputRef.current && inputRef.current.value.trim() === q) {
          // Drop a suggestion that's an exact match for what's already
          // typed -- there's nothing left to "suggest" once it's already
          // there, and without this, opening Edit on an existing
          // repair/sale shows a dropdown offering the field's own current
          // value back to itself before anyone's touched anything (every
          // saved value is, by definition, already in its own suggestion
          // history).
          const filtered = results.filter((r) => r.trim().toLowerCase() !== q.toLowerCase());
          setItems(filtered);
          setOpen(filtered.length > 0);
        }
      } catch {
        setItems([]);
        setOpen(false);
      }
    }, 250);
    return () => clearTimeout(timerRef.current);
  }, [value, endpoint]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        name={name}
        value={value}
        required={required}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (items.length) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`w-full rounded-[10px] border border-border-strong bg-card px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-[color:var(--accent-focus-ring)] focus:border-ok ${className}`}
        {...rest}
      />
      {open ? (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-[10px] border border-border bg-card shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          {items.map((text) => (
            <button
              key={text}
              type="button"
              className="block w-full text-left px-3 py-2 text-sm hover:bg-ok-bg border-0 bg-transparent cursor-pointer text-text"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(text);
                setOpen(false);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
