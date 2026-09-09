// Ported from common.js's initCommonChrome(): fetches the same three
// things every page needs (mode, shop name, currency symbol) once, at
// the top of the app, instead of every page re-querying the DOM for
// elements to fill in. Same three API calls, same fallback-to-static
// behaviour on failure -- just React state instead of direct DOM writes.
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [mode, setMode] = useState(null); // null = still loading
  const [shopName, setShopName] = useState("DropFix");
  // Falls back to £ -- same default the old static HTML's bare "£" in
  // each label was already a fallback for, before common.js's fetch
  // landed (see that file's comment on .currency-symbol spans).
  const [currencySymbol, setCurrencySymbol] = useState("£");

  useEffect(() => {
    let cancelled = false;

    api
      .get("/api/status")
      .then((status) => {
        if (!cancelled) setMode(status.mode);
      })
      .catch(() => {
        if (!cancelled) setMode("unreachable");
      });

    (async () => {
      try {
        const settings = await api.get("/api/tools/shop-settings");
        if (cancelled) return;
        if (settings.shop_name) setShopName(settings.shop_name);
        const choices = await api.get("/api/currency-choices");
        if (cancelled) return;
        const match = choices.find((c) => c.code === settings.currency_code);
        if (match) setCurrencySymbol(match.symbol);
      } catch (err) {
        // Keep the static fallbacks -- same behaviour as common.js.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ShopContext.Provider value={{ mode, shopName, currencySymbol }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}

// Drop-in replacement for <span class="currency-symbol">&pound;</span>
// -- same reactive-to-Tools-currency-setting rule, just a real component
// instead of a DOM span filled in later.
export function CurrencySymbol() {
  const { currencySymbol } = useShop();
  return currencySymbol;
}
