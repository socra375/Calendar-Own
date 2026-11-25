/** Composiciones gráficas del panel de acceso: SVG puro (rejilla mensual abstracta y tira semanal). */

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const CELL_W = 60;
const CELL_H = 52;
const TOP = 30;
const OFFSET = 2; // el mes empieza en miércoles
const EVENT_DAYS = new Map<number, "accent" | "quiet">([
  [5, "quiet"],
  [9, "accent"],
  [16, "quiet"],
  [19, "quiet"],
  [27, "accent"],
]);

/** Rejilla mensual con dos fechas resaltadas (una rellena, otra en anillo). */
export function MonthArt({ className }: { className?: string }) {
  const rows = 5;
  const cells = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const idx = i + OFFSET;
    return { day, col: idx % 7, row: Math.floor(idx / 7) };
  });
  return (
    <svg viewBox="0 0 420 300" aria-hidden focusable="false" className={className} fill="none">
      {Array.from({ length: 8 }, (_, c) => (
        <path key={`v${c}`} d={`M${c * CELL_W} ${TOP} V${TOP + rows * CELL_H}`} pathLength={1} className="auth-art-line stroke-line-strong" strokeWidth="1" style={{ animationDelay: `${0.1 + c * 0.05}s` }} />
      ))}
      {Array.from({ length: rows + 1 }, (_, r) => (
        <path key={`h${r}`} d={`M0 ${TOP + r * CELL_H} H420`} pathLength={1} className="auth-art-line stroke-line-strong" strokeWidth="1" style={{ animationDelay: `${0.2 + r * 0.07}s` }} />
      ))}
      {DAYS.map((d, c) => (
        <text key={d} x={c * CELL_W + CELL_W / 2} y="16" textAnchor="middle" className="fill-muted font-sans" fontSize="10" fontWeight="600" letterSpacing="1.5">
          {d}
        </text>
      ))}
      {cells.map(({ day, col, row }) => {
        const x = col * CELL_W;
        const y = TOP + row * CELL_H;
        const ev = EVENT_DAYS.get(day);
        const solid = day === 12;
        const ring = day === 24;
        return (
          <g key={day} className="auth-art-cell" style={{ animationDelay: `${0.5 + day * 0.025}s` }}>
            {solid && <circle cx={x + 18} cy={y + 18} r="13" className="auth-art-mark fill-accent" style={{ animationDelay: "1.1s" }} />}
            {ring && <circle cx={x + 18} cy={y + 18} r="12.5" className="auth-art-mark stroke-accent-bright" strokeWidth="1.5" style={{ animationDelay: "1.35s" }} />}
            <text x={x + 18} y={y + 22} textAnchor="middle" fontSize="11" fontWeight={solid || ring ? 700 : 500} className={solid ? "fill-accent-ink font-sans" : ring ? "fill-accent font-sans" : "fill-muted font-sans"}>
              {day}
            </text>
            {ev && <rect x={x + 8} y={y + 38} width={ev === "accent" ? 38 : 26} height="4" rx="2" className={ev === "accent" ? "fill-accent-bright" : "fill-line-strong"} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Versión compacta (móvil/tablet): una semana con el día de hoy resaltado. */
export function WeekArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 336 56" aria-hidden focusable="false" className={className} fill="none">
      <path d="M0 55.5 H336" pathLength={1} className="auth-art-line stroke-line-strong" strokeWidth="1" />
      {DAYS.map((d, i) => {
        const cx = i * 48 + 24;
        const hot = i === 2;
        return (
          <g key={d} className="auth-art-cell" style={{ animationDelay: `${0.2 + i * 0.06}s` }}>
            <text x={cx} y="12" textAnchor="middle" fontSize="10" fontWeight="600" letterSpacing="1.5" className="fill-muted font-sans">
              {d}
            </text>
            {hot && <circle cx={cx} cy="34" r="13" className="auth-art-mark fill-accent" style={{ animationDelay: "0.6s" }} />}
            <text x={cx} y="38" textAnchor="middle" fontSize="12" fontWeight={hot ? 700 : 500} className={hot ? "fill-accent-ink font-sans" : "fill-muted font-sans"}>
              {i + 9}
            </text>
            {i === 5 && <rect x={cx - 11} y="50" width="22" height="3" rx="1.5" className="fill-accent-bright" />}
          </g>
        );
      })}
    </svg>
  );
}
