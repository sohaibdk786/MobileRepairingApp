import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { printReceipt } from "../lib/printing";
import { formatDateTime } from "../components/tools/ToolsUi";

const PAGE_SIZE = 25;
const MOBILE_ITEM = "Mobile Phone";

const fieldClass =
  "rounded-[10px] border border-border-strong bg-card px-2.5 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-[color:var(--accent-focus-ring)] focus:border-ok";

function repairMoneyDisplay(r) {
  if (r.total_pence === null) return "Pending";
  if (r.balance_pence > 0) return `Balance ${r.balance_display}`;
  if (r.has_pending_faults) return `${r.total_display} · pending item`;
  if (r.balance_pence < 0) return `Overpaid ${r.balance_display.slice(1)}`;
  return r.total_display;
}

function ReprintCard({ title, lookupUrl, describe, printUrl }) {
  const [note, setNote] = useState("Loading...");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(lookupUrl)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setNote(describe(d));
      })
      .catch(() => {
        if (!cancelled) setNote("None yet");
      });
    return () => {
      cancelled = true;
    };
  }, [lookupUrl, describe]);

  async function onReprint() {
    if (!data || busy) return;
    setBusy(true);
    const original = note;
    setNote("Printing...");
    try {
      await printReceipt(printUrl(data));
      setNote(original);
    } catch (err) {
      setNote(`Could not print: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] p-4 flex flex-col text-center min-h-[140px]">
      <h3 className="mt-0 mb-2 text-[0.95rem] font-semibold">{title}</h3>
      <p className="text-muted text-sm flex-1 flex items-center justify-center m-0 px-1">{note}</p>
      <button
        type="button"
        disabled={!data || busy}
        onClick={onReprint}
        className="mt-3 w-full rounded-[10px] bg-ok text-white font-semibold px-3 py-2.5 text-sm border-0 cursor-pointer hover:bg-accent-dark disabled:opacity-50"
      >
        Reprint
      </button>
    </div>
  );
}

function ResultRow({ to, primary, secondary, rightPrimary, rightSecondary }) {
  return (
    <Link
      to={to}
      className="flex justify-between gap-3 px-2 py-2.5 border-b border-border no-underline text-inherit rounded-[10px] hover:bg-bg transition-colors"
    >
      <div className="min-w-0">
        <div className="font-semibold text-sm truncate">{primary}</div>
        <div className="text-muted text-[0.82rem] truncate">{secondary}</div>
      </div>
      <div className="text-right whitespace-nowrap shrink-0">
        <div className="text-sm font-medium">{rightPrimary}</div>
        <div className="text-muted text-[0.82rem]">{rightSecondary}</div>
      </div>
    </Link>
  );
}

function usePagedList(loader) {
  const [items, setItems] = useState([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emptyNote, setEmptyNote] = useState("");
  const loadingRef = useRef(false);
  const doneRef = useRef(false);
  const offsetRef = useRef(0);

  const resetAndLoad = useCallback(async () => {
    loadingRef.current = true;
    doneRef.current = false;
    offsetRef.current = 0;
    setLoading(true);
    setDone(false);
    setItems([]);
    setEmptyNote("");
    try {
      const { rows, note, finished } = await loader(0);
      setItems(rows);
      offsetRef.current = rows.length;
      setDone(finished);
      doneRef.current = finished;
      if (note) setEmptyNote(note);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [loader]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || doneRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const { rows, note, finished } = await loader(offsetRef.current);
      setItems((prev) => [...prev, ...rows]);
      offsetRef.current = offsetRef.current + rows.length;
      setDone(finished);
      doneRef.current = finished;
      if (note && offsetRef.current === rows.length) setEmptyNote(note);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    const t = setTimeout(() => {
      resetAndLoad();
    }, 250);
    return () => clearTimeout(t);
  }, [resetAndLoad]);

  return { items, loading, done, emptyNote, loadMore, resetAndLoad };
}

function useInfiniteScroll(rootRef, sentinelRef, onLoadMore, enabled) {
  useEffect(() => {
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !enabled) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { root, threshold: 0.1 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [rootRef, sentinelRef, onLoadMore, enabled]);
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") || "");
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") || "");
  const [collected, setCollected] = useState(searchParams.get("collected") || "any");
  const [ready, setReady] = useState(searchParams.get("ready") || "any");
  const [paid, setPaid] = useState(searchParams.get("paid") || "any");
  const [mobileOnly, setMobileOnly] = useState(searchParams.get("item") === MOBILE_ITEM);

  // Keep URL in sync (replace, like vanilla)
  useEffect(() => {
    const params = {};
    if (q.trim()) params.q = q.trim();
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (collected !== "any") params.collected = collected;
    if (ready !== "any") params.ready = ready;
    if (paid !== "any") params.paid = paid;
    if (mobileOnly) params.item = MOBILE_ITEM;
    setSearchParams(params, { replace: true });
  }, [q, dateFrom, dateTo, collected, ready, paid, mobileOnly, setSearchParams]);

  const loadRepairs = useCallback(
    async (offset) => {
      const params = new URLSearchParams({
        q: q.trim(),
        date_from: dateFrom,
        date_to: dateTo,
        collected,
        ready,
        paid,
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      const results = await api.get(`/api/search/repairs?${params}`);
      return {
        rows: results,
        note: results.length === 0 && offset === 0 ? "No repairs match." : "",
        finished: results.length < PAGE_SIZE,
      };
    },
    [q, dateFrom, dateTo, collected, ready, paid]
  );

  const loadSales = useCallback(
    async (offset) => {
      const paidExcludesSales = paid !== "any" && paid !== "yes";
      if (collected !== "any" || ready !== "any" || paidExcludesSales) {
        return {
          rows: [],
          note: "Not applicable to sales — Collected, Ready, and Not Paid/Unsettled are repair-only filters.",
          finished: true,
        };
      }
      const params = new URLSearchParams({
        q: q.trim(),
        date_from: dateFrom,
        date_to: dateTo,
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      if (mobileOnly) params.set("item", MOBILE_ITEM);
      const results = await api.get(`/api/search/sales?${params}`);
      return {
        rows: results,
        note: results.length === 0 && offset === 0 ? "No sales match." : "",
        finished: results.length < PAGE_SIZE,
      };
    },
    [q, dateFrom, dateTo, collected, ready, paid, mobileOnly]
  );

  const repairs = usePagedList(loadRepairs);
  const sales = usePagedList(loadSales);

  const repairsListRef = useRef(null);
  const salesListRef = useRef(null);
  const repairsSentinelRef = useRef(null);
  const salesSentinelRef = useRef(null);

  useInfiniteScroll(repairsListRef, repairsSentinelRef, repairs.loadMore, !repairs.done);
  useInfiniteScroll(salesListRef, salesSentinelRef, sales.loadMore, !sales.done);

  const describeRepair = useCallback(
    (r) => `${r.ticket} · ${r.name} · ${r.model}`,
    []
  );
  const describeSale = useCallback((s) => `${s.item} · ${s.name}`, []);
  const printIntake = useCallback(
    (r) => `/api/repairs/${encodeURIComponent(r.ticket)}/print/intake`,
    []
  );
  const printCollection = useCallback(
    (r) => `/api/repairs/${encodeURIComponent(r.ticket)}/print/collection`,
    []
  );
  const printSale = useCallback((s) => `/api/sales/${s.id}/print`, []);

  return (
    <div>
      <h2 className="text-2xl font-semibold mt-0 mb-4">Search</h2>

      {/* Quick reprint — same 3 cards as vanilla */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 items-stretch">
        <ReprintCard
          title="Last repair"
          lookupUrl="/api/reprint/last-repair"
          describe={describeRepair}
          printUrl={printIntake}
        />
        <ReprintCard
          title="Last collection receipt"
          lookupUrl="/api/reprint/last-collection"
          describe={describeRepair}
          printUrl={printCollection}
        />
        <ReprintCard
          title="Last sale"
          lookupUrl="/api/reprint/last-sale"
          describe={describeSale}
          printUrl={printSale}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end mb-5 bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] p-4">
        <label className="flex flex-col gap-1 text-[0.82rem] text-muted font-medium flex-1 min-w-[200px]">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ticket, name, phone, model, passcode, item, serial…"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.82rem] text-muted font-medium">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.82rem] text-muted font-medium">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.82rem] text-muted font-medium">
          Collected
          <select
            value={collected}
            onChange={(e) => setCollected(e.target.value)}
            className={fieldClass}
          >
            <option value="any">Any</option>
            <option value="yes">Collected</option>
            <option value="no">Not Collected</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[0.82rem] text-muted font-medium">
          Ready
          <select value={ready} onChange={(e) => setReady(e.target.value)} className={fieldClass}>
            <option value="any">Any</option>
            <option value="yes">Ready</option>
            <option value="no">Not Ready</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[0.82rem] text-muted font-medium">
          Paid
          <select value={paid} onChange={(e) => setPaid(e.target.value)} className={fieldClass}>
            <option value="any">Any</option>
            <option value="yes">Paid</option>
            <option value="no">Not Paid</option>
            <option value="unsettled">Unsettled</option>
          </select>
        </label>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <div className="bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] p-4 flex flex-col min-h-0">
          <h3 className="mt-0 mb-3 text-[1.05rem] font-semibold">Repairs</h3>
          <div ref={repairsListRef} className="max-h-[70vh] overflow-y-auto">
            {repairs.items.map((r) => (
              <ResultRow
                key={r.ticket}
                to={`/detail?type=repair&ticket=${encodeURIComponent(r.ticket)}`}
                primary={
                  <>
                    {r.ticket} · {r.name}
                    {r.passcode ? (
                      <span className="underline underline-offset-2"> · {r.passcode}</span>
                    ) : null}
                  </>
                }
                secondary={`${r.model} · ${r.status}`}
                rightPrimary={repairMoneyDisplay(r)}
                rightSecondary={formatDateTime(r.created_at)}
              />
            ))}
            {!repairs.loading && repairs.items.length === 0 && repairs.emptyNote ? (
              <p className="text-muted py-4 m-0 text-sm">{repairs.emptyNote}</p>
            ) : null}
            <div
              ref={repairsSentinelRef}
              className="text-center py-3 text-muted-2 text-[0.82rem]"
            >
              {repairs.loading ? "Loading…" : repairs.done ? "" : " "}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="m-0 text-[1.05rem] font-semibold">Sales</h3>
            <button
              type="button"
              onClick={() => setMobileOnly((v) => !v)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold border cursor-pointer ${
                mobileOnly
                  ? "bg-ok-bg text-ok border-ok"
                  : "bg-bg text-muted border-border-strong"
              }`}
            >
              {mobileOnly ? "Mobile phones" : "All items"}
            </button>
          </div>
          <div ref={salesListRef} className="max-h-[70vh] overflow-y-auto">
            {sales.items.map((s) => (
              <ResultRow
                key={s.id}
                to={`/detail?type=sale&id=${s.id}`}
                primary={s.item}
                secondary={`${s.name} · ${s.method}`}
                rightPrimary={s.price_display}
                rightSecondary={formatDateTime(s.sold_at)}
              />
            ))}
            {!sales.loading && sales.items.length === 0 && sales.emptyNote ? (
              <p className="text-muted py-4 m-0 text-sm">{sales.emptyNote}</p>
            ) : null}
            <div
              ref={salesSentinelRef}
              className="text-center py-3 text-muted-2 text-[0.82rem]"
            >
              {sales.loading ? "Loading…" : sales.done ? "" : " "}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
