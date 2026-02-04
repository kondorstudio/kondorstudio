import React from "react";
import { Plus, BarChart3, LineChart, Table2, Gauge, Type, CalendarDays, Filter, UserRound } from "lucide-react";

const CHART_ITEMS = [
  { type: "kpi", label: "KPI", icon: Gauge },
  { type: "timeseries", label: "Serie temporal", icon: LineChart },
  { type: "bar", label: "Barras", icon: BarChart3 },
  { type: "table", label: "Tabela", icon: Table2 },
];

const CONTROL_ITEMS = [
  { key: "showDateRange", label: "Controle de data", icon: CalendarDays },
  { key: "showPlatforms", label: "Controle de plataforma", icon: Filter },
  { key: "showAccounts", label: "Controle de contas", icon: UserRound },
];

export default function AddMenu({
  onAddChart,
  onAddText,
  onEnableControl,
  controls,
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event) => {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Adicionar item ao dashboard"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <Plus className="h-4 w-4" />
        Adicionar
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Menu adicionar"
          className="absolute right-0 z-40 mt-2 w-[280px] rounded-[14px] border border-[var(--border)] bg-white p-2 shadow-[var(--shadow-md)]"
        >
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Graficos
          </p>
          {CHART_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.type}
                type="button"
                role="menuitem"
                onClick={() => {
                  onAddChart(item.type);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[var(--primary)]" />
                  {item.label}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {item.type.toUpperCase()}
                </span>
              </button>
            );
          })}

          <p className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Texto
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAddText();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <span className="inline-flex items-center gap-2">
              <Type className="h-4 w-4 text-[var(--primary)]" />
              Bloco de texto
            </span>
            <span className="text-xs text-[var(--text-muted)]">TEXT</span>
          </button>

          <p className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Controles
          </p>
          {CONTROL_ITEMS.map((item) => {
            const Icon = item.icon;
            const isEnabled = controls?.[item.key] !== false;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  onEnableControl(item.key);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[var(--primary)]" />
                  {item.label}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {isEnabled ? "ativo" : "desativado"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
