import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { ShopProvider } from "./context/ShopContext";
import Layout from "./components/Layout";
import About from "./pages/About";

// Routes are added incrementally as each screen is migrated from the
// old vanilla-JS app -- see README.md's "React + Vite + Tailwind
// migration" section for which screens are done vs. still pending.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ShopProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/about" element={<About />} />
          </Route>
        </Routes>
      </ShopProvider>
    </BrowserRouter>
  </StrictMode>
);
