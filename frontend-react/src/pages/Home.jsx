import { useEffect, useRef, useState } from "react";
import PasteBox from "../components/home/PasteBox";
import RepairBox from "../components/home/RepairBox";
import SaleBox from "../components/home/SaleBox";
import { checkQzTrayIfSelected } from "../lib/printing";

export default function Home() {
  const repairRef = useRef(null);
  const saleRef = useRef(null);
  const pasteRef = useRef(null);
  const [qzWarning, setQzWarning] = useState(null);

  useEffect(() => {
    let cancelled = false;
    checkQzTrayIfSelected().then((msg) => {
      if (!cancelled) setQzWarning(msg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function refreshAll() {
    repairRef.current?.reset();
    saleRef.current?.reset();
    pasteRef.current?.reset();
  }

  return (
    <div>
      {qzWarning ? (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
          {qzWarning}
        </div>
      ) : null}

      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={refreshAll}
          className="rounded-[10px] px-3 py-2 text-sm font-semibold bg-bg text-text border border-border-strong cursor-pointer hover:bg-secondary-hover"
        >
          Refresh (clear all 3 boxes)
        </button>
      </div>

      {/* items-start, not items-stretch: one box growing (e.g. Sale's
          Manual date/time fields, or Paste's resizable textarea) used to
          force the other two, untouched, boxes to that same height too,
          leaving dead empty space at their bottom. Each box now sizes to
          its own content; Paste's height is held explicitly instead
          (PasteBox.jsx) so the row still looks even at rest. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <RepairBox ref={repairRef} />
        <SaleBox ref={saleRef} />
        <PasteBox ref={pasteRef} />
      </div>
    </div>
  );
}
