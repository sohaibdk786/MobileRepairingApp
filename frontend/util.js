// Small helpers shared by more than one page.

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

// The backend stores timestamps as the shop PC's own local clock with no
// timezone suffix (e.g. "2026-08-10T23:23:45" -- see repairs.py
// _now_iso()). Because the browser runs on that same PC, new Date() on a
// timezone-less date-time string is parsed as local time by the browser
// too, so no conversion is needed here -- just formatting.
function formatDateTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

function formatTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d)) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Formats a pence value computed in the browser (e.g. the "old total"
// half of the struck-through price line) using whichever currency
// symbol the API is already using elsewhere on the same screen --
// sampleDisplay is any *_display string from the same response (e.g.
// r.total_display). Pulling the symbol out of that, rather than keeping
// a second currency table in JS, means the backend (Tools > Shop
// Details) stays the one place that decides which symbol is current --
// this can never drift out of sync with it.
function formatPenceLike(pence, sampleDisplay) {
  if (pence === null || pence === undefined) return "Pending";
  // Strip a leading "-" before extracting the symbol, so a NEGATIVE
  // sample (e.g. an overpaid ticket's own balance_display, used as the
  // sample for the split-payment hints) never gets its minus sign
  // mistaken for part of the currency symbol -- the sign applied below
  // is entirely about the pence value being formatted NOW, independent
  // of whether the sample happened to be negative.
  const positiveSample = (sampleDisplay || "").replace(/^-/, "");
  const match = positiveSample.match(/^(.*?)\d+\.\d{2}$/);
  const symbol = match ? match[1] : "£";
  // Same sign-before-symbol rule as the backend's format_pence() -- a
  // negative amount reads as "-£5.00", never "£-5.00".
  const sign = pence < 0 ? "-" : "";
  return `${sign}${symbol}${(Math.abs(pence) / 100).toFixed(2)}`;
}

function goBack(fallbackUrl) {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = fallbackUrl || "/";
  }
}
