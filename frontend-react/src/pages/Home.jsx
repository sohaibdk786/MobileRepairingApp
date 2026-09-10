import { useEffect, useRef, useState } from "react";
import PasteBox from "../components/home/PasteBox";
import RepairBox from "../components/home/RepairBox";
import SaleBox from "../components/home/SaleBox";
import { checkQzTrayIfLive } from "../lib/printing";

export default function Home() {
  const repairRef = useRef(null);
  const saleRef = useRef(null);
  const pasteRef = useRef(null);
  const [qzWarning, setQzWarning] = useState(null);

  useEffect(() => {
    let cancelled = false;
    checkQzTrayIfLive().then((msg) => {
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <RepairBox ref={repairRef} />
        <SaleBox ref={saleRef} />
        <PasteBox ref={pasteRef} />
      </div>
    </div>
  );
}
