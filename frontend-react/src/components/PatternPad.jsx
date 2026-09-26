import { useId, useRef, useState } from "react";

const GRID = [
  { n: 1, x: 20, y: 20 }, { n: 2, x: 60, y: 20 }, { n: 3, x: 100, y: 20 },
  { n: 4, x: 20, y: 60 }, { n: 5, x: 60, y: 60 }, { n: 6, x: 100, y: 60 },
  { n: 7, x: 20, y: 100 }, { n: 8, x: 60, y: 100 }, { n: 9, x: 100, y: 100 },
];
const HIT_RADIUS = 18;

function parseSequence(value) {
  return (value || "")
    .split("-")
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= 1 && n <= 9);
}

/** Android-style 3x3 pattern lock. Draw mode: drag across dots to
 * record one. readOnly: just displays an already-saved one. Talks to
 * the parent in the same "1-4-7-8-9" dot-sequence string the pattern
 * is stored in, so callers never touch dot coordinates themselves.
 */
export default function PatternPad({ value, onChange, readOnly = false, size = 132 }) {
  const svgRef = useRef(null);
  const [drawing, setDrawing] = useState([]);
  // Unique per instance so two PatternPads on the same page (e.g. a
  // future list of several tickets) never share one <marker> id.
  const arrowId = useId();

  const sequence = readOnly ? parseSequence(value) : drawing;

  function dotAt(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 120;
    const y = ((clientY - rect.top) / rect.height) * 120;
    return GRID.find((d) => Math.hypot(d.x - x, d.y - y) <= HIT_RADIUS);
  }

  function handlePointerDown(e) {
    if (readOnly) return;
    const dot = dotAt(e.clientX, e.clientY);
    if (!dot) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing([dot.n]);
  }

  function handlePointerMove(e) {
    if (readOnly) return;
    // e.buttons is the live "is a button actually still held" state --
    // without this check, moving the mouse back over the grid AFTER
    // releasing it kept adding dots forever, since nothing else here
    // told drawing apart from merely hovering.
    if (e.buttons === 0) return;
    const dot = dotAt(e.clientX, e.clientY);
    if (!dot) return;
    setDrawing((seq) => (seq.length === 0 || seq.includes(dot.n) ? seq : [...seq, dot.n]));
  }

  function handlePointerUp() {
    if (readOnly || drawing.length === 0) return;
    onChange?.(drawing.join("-"));
    // drawing is NOT reset here -- the just-finished pattern should stay
    // visible (dots lit, line drawn) until a fresh pointerdown starts a
    // new one (which already overwrites it) or Clear is pressed.
  }

  function handleClear() {
    setDrawing([]);
    onChange?.("");
  }

  const active = new Set(sequence);
  const dotsInOrder = sequence.map((n) => GRID.find((d) => d.n === n));
  const points = dotsInOrder.map((d) => `${d.x},${d.y}`).join(" ");
  const startDot = dotsInOrder[0] || null;
  const endDot = sequence.length > 1 ? dotsInOrder[dotsInOrder.length - 1] : null;

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <svg
        ref={svgRef}
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className={readOnly ? "" : "touch-none cursor-pointer"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {endDot ? (
          <defs>
            {/* Arrowhead on the line's end only -- which dot is first vs
                last isn't otherwise visible once a pattern's saved and
                just shown as a static shape. */}
            <marker
              id={arrowId}
              markerWidth="6"
              markerHeight="6"
              refX="4.5"
              refY="3"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L6,3 L0,6 Z" style={{ fill: "var(--ok)" }} />
            </marker>
          </defs>
        ) : null}
        {points ? (
          <polyline
            points={points}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="fill-none stroke-ok"
            markerEnd={endDot ? `url(#${arrowId})` : undefined}
          />
        ) : null}
        {startDot ? (
          // A ring around the first dot -- pairs with the end arrowhead
          // so start and end are both visible from the shape alone, not
          // just the "Start -> End" caption below.
          <circle
            cx={startDot.x}
            cy={startDot.y}
            r="13.5"
            strokeWidth="1.5"
            strokeDasharray="2.5 2.5"
            className="fill-none stroke-ok"
          />
        ) : null}
        {GRID.map((d) => (
          <g key={d.n}>
            <circle
              cx={d.x}
              cy={d.y}
              r={active.has(d.n) ? 10 : 8}
              className={active.has(d.n) ? "fill-ok" : "fill-border-strong"}
            />
            {/* Dot numbers stay visible in both draw and read-only mode --
                lets staff read a saved pattern back as plain "1-4-7-8-9"
                digits, not just a shape, and line it up with the same
                numbering the price receipt would use if typed instead. */}
            <text
              x={d.x}
              y={d.y}
              dy="2.6"
              textAnchor="middle"
              fontSize="7"
              className={active.has(d.n) ? "fill-card" : "fill-muted"}
            >
              {d.n}
            </text>
          </g>
        ))}
      </svg>
      {endDot ? (
        <p className="text-[0.65rem] text-muted leading-tight">
          Start <strong className="text-text">{sequence[0]}</strong>
          {" -> End "}
          <strong className="text-text">{sequence[sequence.length - 1]}</strong>
        </p>
      ) : null}
      {!readOnly ? (
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-muted underline bg-transparent border-0 cursor-pointer"
        >
          Clear pattern
        </button>
      ) : null}
    </div>
  );
}
