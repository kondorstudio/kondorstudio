import React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/utils/classnames.js";

const WEEK_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

function toDateKey(date) {
  return date.toLocaleDateString("en-CA");
}

function buildMonthGrid(current) {
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = firstOfMonth.getDay();
  const startDate = new Date(firstOfMonth);
  startDate.setDate(firstOfMonth.getDate() - firstWeekday);

  const days = [];
  let cursor = new Date(startDate);
  for (let i = 0; i < 42; i += 1) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function parseValue(value) {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map((item) => Number(item));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDisplay(value) {
  if (!value) return "";
  const date = parseValue(value);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR");
}

function emitChange(onChange, value) {
  if (typeof onChange !== "function") return;
  onChange({ target: { value } });
}

export function DateField({
  value = "",
  onChange,
  placeholder = "dd/mm/aaaa",
  className = "",
  inputClassName = "",
  disabled = false,
}) {
  const containerRef = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const selectedDate = React.useMemo(() => parseValue(value), [value]);
  const [viewDate, setViewDate] = React.useState(() => selectedDate || new Date());

  React.useEffect(() => {
    if (selectedDate) setViewDate(selectedDate);
  }, [selectedDate]);

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const days = React.useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  const displayValue = formatDisplay(value);
  const todayKey = toDateKey(new Date());
  const currentMonth = viewDate.getMonth();

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center rounded-[10px] border border-[var(--border)] bg-white px-3 pl-9 text-left text-sm text-[var(--text)] shadow-sm",
          "transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
          "hover:bg-[var(--surface-muted)] focus:outline-none focus:ring-2 focus:ring-[rgba(31,111,235,0.2)]",
          disabled && "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-muted)]",
          inputClassName
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={displayValue ? "" : "text-[var(--text-muted)]"}>
          {displayValue || placeholder}
        </span>
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-50 mt-2 min-w-[260px] w-full rounded-[16px] border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-md)] animate-fade-in-up"
          )}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-[var(--text)] capitalize">
              {viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </div>
            <button
              type="button"
              onClick={() =>
                setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              aria-label="Proximo mes"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--text-muted)]">
            {WEEK_LABELS.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = toDateKey(day);
              const isCurrentMonth = day.getMonth() === currentMonth;
              const isSelected = selectedDate && key === toDateKey(selectedDate);
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    emitChange(onChange, key);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-8 w-8 rounded-[10px] text-xs font-medium transition",
                    isSelected
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--text)] hover:bg-[var(--surface-muted)]",
                    !isCurrentMonth && "text-[var(--text-muted)] opacity-70",
                    isToday && !isSelected && "border border-[var(--primary)]"
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                emitChange(onChange, "");
                setOpen(false);
              }}
              className="text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                emitChange(onChange, toDateKey(new Date()));
                setOpen(false);
              }}
              className="text-[var(--primary)] hover:underline"
            >
              Hoje
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TimeField({
  value = "",
  onChange,
  placeholder = "00:00",
  className = "",
  inputClassName = "",
  step = 15,
  disabled = false,
}) {
  const datalistId = React.useId();

  const times = React.useMemo(() => {
    const items = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (let min = 0; min < 60; min += step) {
        items.push(`${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
      }
    }
    return items;
  }, [step]);

  return (
    <div className={cn("relative", className)}>
      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        type="time"
        value={value}
        onChange={(event) => emitChange(onChange, event.target.value)}
        placeholder={placeholder}
        step={60}
        list={datalistId}
        className={cn(
          "flex h-10 w-full items-center rounded-[10px] border border-[var(--border)] bg-white px-3 pl-9 text-left text-sm text-[var(--text)] shadow-sm",
          "transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
          "hover:bg-[var(--surface-muted)] focus:outline-none focus:ring-2 focus:ring-[rgba(31,111,235,0.2)]",
          disabled && "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-muted)]",
          inputClassName
        )}
        disabled={disabled}
      />
      <datalist id={datalistId}>
        {times.map((time) => (
          <option key={time} value={time} />
        ))}
      </datalist>
    </div>
  );
}

export default DateField;
