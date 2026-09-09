// Ported from frontend/about.html. Deliberately does NOT follow the
// shop's own name (see ShopContext) -- this names the SOFTWARE itself
// (built by, contact, version), same reasoning as the original: renaming
// the shop in Tools > Shop Details shouldn't make this page lie about
// what software it's describing.
export default function About() {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] p-6 max-w-[480px] mx-auto text-center">
      <h2 className="mt-0 text-lg font-semibold">DropFix System</h2>
      <p className="text-muted text-sm">Version 1.0</p>
      <dl className="text-left mt-4">
        <dt className="text-muted text-sm mt-3">Built by</dt>
        <dd className="mt-0.5 font-semibold">Snappy</dd>
        <dt className="text-muted text-sm mt-3">Contact</dt>
        <dd className="mt-0.5 font-semibold">
          <a href="mailto:sohaibdk786@gmail.com" className="text-accent no-underline hover:underline">
            sohaibdk786@gmail.com
          </a>
        </dd>
        <dt className="text-muted text-sm mt-3">Support</dt>
        <dd className="mt-0.5 font-semibold">For support or issues, contact the developer above.</dd>
        <dt className="text-muted text-sm mt-3">Build year</dt>
        <dd className="mt-0.5 font-semibold">2026</dd>
      </dl>
    </div>
  );
}
