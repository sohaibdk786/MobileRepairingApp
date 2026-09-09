// Tools > Appearance: Light/Dark/System toggle. Depends on theme.js
// (loaded in <head>) for getStoredTheme()/setTheme().

(function () {
  const row = document.getElementById("theme-row");
  if (!row) return; // not on this page

  const buttons = Array.from(row.querySelectorAll(".btn-toggle"));

  function highlightCurrent() {
    const current = getStoredTheme();
    buttons.forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === current));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.value);
      highlightCurrent();
    });
  });

  highlightCurrent();
})();

// Accent colour picker -- a separate IIFE on purpose, not sharing any
// state or functions with the theme toggle above. Depends on accent.js
// (loaded in <head>) for getStoredAccent()/setAccent(). Which colour is
// "the app's accent" and whether the page is light or dark are two
// independent choices; this block only ever touches the former.
(function () {
  const row = document.getElementById("accent-row");
  if (!row) return; // not on this page

  const buttons = Array.from(row.querySelectorAll(".btn-toggle"));

  function highlightCurrent() {
    const current = getStoredAccent();
    buttons.forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === current));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setAccent(btn.dataset.value);
      highlightCurrent();
    });
  });

  highlightCurrent();
})();
