// Ported from the shared <header>/<nav> markup every old .html page
// repeated -- now one real shared component instead of copy-pasted
// markup, with React Router's <Outlet/> standing in for "whichever page
// is current".
import { Link, Outlet, useLocation } from "react-router-dom";
import { useShop } from "../context/ShopContext";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/about", label: "About" },
  { href: "/tools", label: "Tools", isTools: true },
];

export default function Layout() {
  const { mode, shopName } = useShop();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-bg text-text">
      {mode === "unreachable" ? (
        <div className="text-center py-2 text-sm font-semibold bg-error-bg text-error-text">
          Could not reach the app server
        </div>
      ) : null}
      <header className="bg-topbar backdrop-blur-md border-b border-border sticky top-0 z-10">
        <div className="w-full flex items-center justify-between flex-wrap gap-2 px-6 sm:px-12 py-3 sm:py-4">
          <h1 className="text-base sm:text-lg m-0 font-semibold tracking-tight">
            <Link to="/" className="text-inherit no-underline hover:opacity-70">
              {shopName}
            </Link>
          </h1>
          <nav className="flex gap-0.5 sm:gap-1 flex-wrap">
            {NAV_LINKS.map((link) => {
              const isCurrent =
                link.href === pathname || (link.isTools && pathname.startsWith("/tools"));
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`no-underline px-2.5 sm:px-3 py-1.5 rounded-full font-medium text-[0.82rem] sm:text-sm transition-colors touch-manipulation ${
                    link.isTools ? "ml-1 sm:ml-2" : ""
                  } ${isCurrent ? "bg-ok-bg text-ok" : "text-text hover:bg-bg"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="w-full px-6 sm:px-12 py-6 sm:py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <div id="modal-root" />
    </div>
  );
}
