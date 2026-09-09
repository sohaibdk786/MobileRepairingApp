// Accent colour preference (Tools > Appearance) -- completely separate
// from theme.js's Light/Dark/System choice. Which colour is "the app's
// green" and whether the page is light or dark are two independent
// questions: switching accent to Blue must never touch the light/dark
// setting, and switching Light/Dark/System must never touch the chosen
// accent. style.css composes the two together (e.g.
// :root[data-theme="dark"][data-accent="blue"]) so both can vary
// independently while still landing on the right final colour.
//
// Deliberately stored in localStorage, not the database: this is a
// per-browser display preference, not shop data -- same reasoning as the
// theme choice.
//
// Loaded as an early, non-deferred <script> in every page's <head>,
// right after theme.js, so applyAccent() runs before the page paints --
// that's what avoids a flash of the wrong colour on load.
const ACCENT_STORAGE_KEY = "dropfix-accent";
const DEFAULT_ACCENT = "green";

function getStoredAccent() {
  const value = localStorage.getItem(ACCENT_STORAGE_KEY);
  return value || DEFAULT_ACCENT;
}

function applyAccent(accent) {
  document.documentElement.dataset.accent = accent;
}

function setAccent(accent) {
  localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  applyAccent(accent);
}

applyAccent(getStoredAccent());

// Same back-forward-cache fix as theme.js -- see that file's comment.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) applyAccent(getStoredAccent());
});
