// Light/Dark/System display preference (Tools > Appearance).
//
// Deliberately stored in localStorage, not the database: this is a
// per-browser display preference, not shop data. If a second till is
// ever added in the shop, it shouldn't inherit whichever theme someone
// picked on the first one.
//
// Loaded as an early, non-deferred <script> in every page's <head> (see
// each .html file) so applyTheme() runs and sets the attribute BEFORE
// the page paints -- that's what avoids a flash of the wrong theme on
// load. The CSS itself (style.css) reads the data-theme attribute this
// sets and swaps every colour token accordingly.
const THEME_STORAGE_KEY = "dropfix-theme";

function getStoredTheme() {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function setTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

applyTheme(getStoredTheme());

// A page restored from the back-forward cache (e.g. hitting Back to land
// on Home) doesn't re-run this script -- the browser replays the DOM
// exactly as it was when the page was frozen, which can be the theme from
// before a later change on another page. Re-apply on that specific
// restore case only; a normal fresh load already got it right above.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) applyTheme(getStoredTheme());
});
