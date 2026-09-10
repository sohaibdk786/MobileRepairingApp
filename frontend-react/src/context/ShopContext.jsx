// Fetches shop chrome once (name, currency, server reachability) for the
// whole app — header brand, money symbols, etc.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api";

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [mode, setMode] = useState(null); // null = still loading
  const [shopName, setShopName] = useState("DropFix");
  const [currencySymbol, setCurrencySymbol] = useState("£");

  const refreshShop = useCallback(async () => {
    try {
      const settings = await api.get("/api/tools/shop-settings");
      if (settings.shop_name) setShopName(settings.shop_name);
      const choices = await api.get("/api/currency-choices");
      const match = choices.find((c) => c.code === settings.currency_code);
      if (match) setCurrencySymbol(match.symbol);
      return settings;
    } catch {
      return null;
    }
  }, []);

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

    refreshShop().then(() => {
      /* keep static fallbacks on failure */
    });

    return () => {
      cancelled = true;
    };
  }, [refreshShop]);

  return (
    <ShopContext.Provider
      value={{ mode, shopName, setShopName, currencySymbol, refreshShop }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}

export function CurrencySymbol() {
  const { currencySymbol } = useShop();
  return currencySymbol;
}
