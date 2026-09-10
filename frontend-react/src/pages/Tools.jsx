import { Link } from "react-router-dom";

function IconShop() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 5 4h14l2 6.5" />
      <path d="M4 10.5h16v8.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5Z" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function IconPrinter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 8V4h10v4" />
      <path d="M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v6H7v-6Z" />
    </svg>
  );
}

function IconAppearance() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" opacity="0.25" stroke="none" />
    </svg>
  );
}

function IconCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.5 19a4.5 4.5 0 0 1-.4-8.98 6 6 0 0 1 11.4-2.5A4.5 4.5 0 0 1 17 19H6.5Z" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.23" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13.3 18.77" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

const TILES = [
  {
    to: "/tools/shop-details",
    title: "Shop Details",
    desc: "Name, address, manager, phone, terms, warranty, and currency on receipts.",
    Icon: IconShop,
    tint: "bg-ok-bg text-ok",
  },
  {
    to: "/tools/phones",
    title: "Phones for sale",
    desc: "List mobiles on the public shop QR page. Print the shop QR.",
    Icon: IconPhone,
    tint: "bg-ok-bg text-ok",
  },
  {
    to: "/tools/website",
    title: "Shop Website",
    desc: "Update the public site's name, phone, email, and links.",
    Icon: IconGlobe,
    tint: "bg-info-bg text-info-text",
  },
  {
    to: "/tools/printer",
    title: "Printer",
    desc: "Detect printers, pick one, and run a test print.",
    Icon: IconPrinter,
    tint: "bg-bg text-muted",
  },
  {
    to: "/tools/appearance",
    title: "Appearance",
    desc: "Company name, theme, and accent colour.",
    Icon: IconAppearance,
    tint: "bg-warn-bg text-warn-text",
  },
  {
    to: "/tools/backup",
    title: "Backup & Restore",
    desc: "Back up now, restore from Drive or a Sheet, export to CSV.",
    Icon: IconCloud,
    tint: "bg-info-bg text-info-text",
  },
  {
    to: "/tools/google",
    title: "Google Connection",
    desc: "Service account key and Sheet/Drive connection status.",
    Icon: IconLink,
    tint: "bg-ok-bg text-ok",
  },
  {
    to: "/tools/deleted",
    title: "Recently Deleted",
    desc: "Restore a repair or sale deleted in the last 3 days.",
    Icon: IconTrash,
    tint: "bg-error-bg text-error",
  },
];

export default function Tools() {
  return (
    <section>
      <div className="mb-5">
        <h2 className="text-2xl font-semibold mt-0 mb-1">Tools</h2>
        <p className="text-muted text-sm m-0">Shop setup, printing, backup, and appearance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TILES.map(({ to, title, desc, Icon, tint }) => (
          <Link
            key={to}
            to={to}
            className="group relative flex flex-col gap-3 no-underline text-inherit bg-card border border-border rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-ok hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_16px_32px_rgba(0,0,0,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-focus-ring)]"
          >
            <span
              className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tint} transition-transform duration-200 group-hover:scale-105`}
            >
              <span className="block h-6 w-6 [&_svg]:h-full [&_svg]:w-full">
                <Icon />
              </span>
            </span>

            <div className="min-w-0 flex-1">
              <span className="block font-semibold text-[1.02rem] mb-1 group-hover:text-ok transition-colors">
                {title}
              </span>
              <span className="block text-sm text-muted leading-snug">{desc}</span>
            </div>

            <span
              className="absolute right-4 top-5 text-muted-2 opacity-0 translate-x-[-4px] transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0"
              aria-hidden
            >
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
