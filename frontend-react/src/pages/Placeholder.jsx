import { Link } from "react-router-dom";

/** Temporary page for URLs that exist in the vanilla app but are not migrated yet. */
export default function Placeholder({ title, description }) {
  return (
    <section className="max-w-xl py-6">
      <h2 className="text-2xl font-semibold mb-2">{title}</h2>
      {description ? <p className="text-muted mb-4">{description}</p> : null}
      <p className="text-sm text-muted mb-4">
        Not migrated to React yet. Use the live app at{" "}
        <a
          href="http://127.0.0.1:8000"
          className="text-ok font-medium no-underline hover:underline"
        >
          http://127.0.0.1:8000
        </a>
        .
      </p>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link to="/" className="text-ok font-medium no-underline hover:underline">
          Home
        </Link>
        <Link to="/about" className="text-ok font-medium no-underline hover:underline">
          About
        </Link>
        <Link to="/tools" className="text-ok font-medium no-underline hover:underline">
          Tools
        </Link>
      </p>
    </section>
  );
}
