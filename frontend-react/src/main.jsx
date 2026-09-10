import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { ModalProvider } from "./context/ModalContext";
import { ShopProvider } from "./context/ShopContext";
import Layout from "./components/Layout";
import Appearance from "./components/tools/Appearance";
import Backup from "./components/tools/Backup";
import Deleted from "./components/tools/Deleted";
import Google from "./components/tools/Google";
import Phones from "./components/tools/Phones";
import Printer from "./components/tools/Printer";
import ShopDetails from "./components/tools/ShopDetails";
import Website from "./components/tools/Website";
import About from "./pages/About";
import Detail from "./pages/Detail";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Tools from "./pages/Tools";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ShopProvider>
        <ModalProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/about" element={<About />} />
              <Route path="/detail" element={<Detail />} />

              <Route path="/tools" element={<Tools />} />
              <Route path="/tools/shop-details" element={<ShopDetails />} />
              <Route path="/tools/phones" element={<Phones />} />
              <Route path="/tools/website" element={<Website />} />
              <Route path="/tools/printer" element={<Printer />} />
              <Route path="/tools/appearance" element={<Appearance />} />
              <Route path="/tools/backup" element={<Backup />} />
              <Route path="/tools/google" element={<Google />} />
              <Route path="/tools/deleted" element={<Deleted />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ModalProvider>
      </ShopProvider>
    </BrowserRouter>
  </StrictMode>
);
