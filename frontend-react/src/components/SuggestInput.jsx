import { useEffect, useRef, useState } from "react";
import { api } from "../api";

function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

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

  useEffect(() => {
    const runLookup = debounce(async (q) => {
      if (!q) {
        setItems([]);
        setOpen(false);
        return;
      }
      try {
        const results = await api.get(`${endpoint}?q=${encodeURIComponent(q)}`);
        if (inputRef.current && inputRef.current.value.trim() === q) {
          setItems(results);
          setOpen(results.length > 0);
        }
      } catch {
        setItems([]);
        setOpen(false);
      }
    }, 250);

    const q = (value || "").trim();
    if (q) runLookup(q);
    else {
      setItems([]);
      setOpen(false);
    }
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
