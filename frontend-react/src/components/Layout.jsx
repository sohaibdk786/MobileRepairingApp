// Ported from the shared <header>/<nav>/mode-banner markup every old
// .html page repeated -- now one real shared component instead of
// copy-pasted markup, with React Router's <Outlet/> standing in for
// "whichever page is current" instead of a separate HTML file per page.
import { Link, Outlet, useLocation } from "react-router-dom";
import { useShop } from "../context/ShopContext";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/about", label: "About" },
  { href: "/tools", label: "Tools", isTools: true },
];

function ModeBanner() {
  const { mode } = useShop();
  if (mode === null) {
    return <div className="text-center py-2.5 text-sm font-semibold">Loading...</div>;
  }
  if (mode === "unreachable") {
    return (
      <div className="text-center py-2.5 text-sm font-semibold bg-error-bg text-error-text">
        Could not reach the app server
      </div>
    );
  }
  const isLive = mode === "live";
  return (
    <div
      className={`text-center py-2.5 text-sm font-semibold tracking-wide ${
        isLive ? "bg-error-bg text-error-text" : "bg-warn-bg text-warn-text"
      }`}
    >
      {isLive ? "LIVE MODE — real data" : "TEST MODE — fake data, safe to bang on"}
    </div>
  );
}

export default function Layout() {
  const { shopName } = useShop();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-bg text-text">
      <ModeBanner />
      <header className="bg-topbar backdrop-blur-md border-b border-border sticky top-0 z-10">
        <div className="flex items-center justify-between flex-wrap gap-2 px-6 py-2.5 max-w-[1400px] mx-auto">
          <h1 className="text-lg">
            <Link to="/" className="text-inherit no-underline hover:opacity-70">
              {shopName}
            </Link>
          </h1>
          <nav className="flex gap-1 flex-wrap">
            {NAV_LINKS.map((link) => {
              const isCurrent =
                link.href === pathname || (link.isTools && pathname.startsWith("/tools"));
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`no-underline px-3 py-1.5 rounded-full font-medium text-sm transition-colors ${
                    link.isTools ? "ml-2" : ""
                  } ${isCurrent ? "bg-ok-bg text-ok" : "text-text hover:bg-bg"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="px-6 py-4 max-w-[1400px] mx-auto">
        <Outlet />
      </main>
      <div id="modal-root" />
    </div>
  );
}
