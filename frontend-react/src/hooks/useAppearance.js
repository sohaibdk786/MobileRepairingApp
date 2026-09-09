// Theme (Light/Dark/System) and Accent colour -- ported from the
// original theme.js/accent.js. Still localStorage, not the database --
// same reasoning as before: a per-browser display preference, not shop
// data, so a second till added later doesn't inherit this one's choice.
import { useCallback, useState } from "react";

const THEME_KEY = "dropfix-theme";
const ACCENT_KEY = "dropfix-accent";
const DEFAULT_ACCENT = "green";

export function getStoredTheme() {
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export function getStoredAccent() {
  return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT;
}

// Used only by the Appearance settings screen -- every other page just
// reads the attribute index.html's inline script already set before
// paint, it never needs to change it.
export function useAppearance() {
  const [theme, setThemeState] = useState(getStoredTheme);
  const [accent, setAccentState] = useState(getStoredAccent);

  const setTheme = useCallback((value) => {
    localStorage.setItem(THEME_KEY, value);
    document.documentElement.dataset.theme = value;
    setThemeState(value);
  }, []);

  const setAccent = useCallback((value) => {
    localStorage.setItem(ACCENT_KEY, value);
    document.documentElement.dataset.accent = value;
    setAccentState(value);
  }, []);

  return { theme, setTheme, accent, setAccent };
}
