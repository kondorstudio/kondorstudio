import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getWorkflowStatusConfig, resolveWorkflowStatus } from "@/utils/postStatus.js";

const WEEK_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

function toDateKey(date) {
  return date.toLocaleDateString("en-CA");
}

function formatMonthLabel(date) {
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildMonthGrid(current) {
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const startDate = new Date(firstOfMonth);
  startDate.setDate(firstOfMonth.getDate() - firstWeekday);

  const weeks = [];
  let cursor = new Date(startDate);

  for (let week = 0; week < 6; week += 1) {
    const days = [];
    for (let day = 0; day < 7; day += 1) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }

  return weeks;
}

export default function Postcalendar({ posts = [], onPostClick }) {
  const [currentDate, setCurrentDate] = React.useState(() => new Date());

  const weeks = React.useMemo(() => buildMonthGrid(currentDate), [currentDate]);

  const postsByDate = React.useMemo(() => {
    const map = new Map();
    (posts || []).forEach((post) => {
      const dateValue =
        post.scheduledDate ||
        post.scheduledAt ||
        post.scheduled_at ||
        post.publishedDate ||
        post.published_at ||
        post.createdAt;
      if (!dateValue) return;
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return;
      const key = toDateKey(date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(post);
    });
    return map;
  }, [posts]);

  const goPrev = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goNext = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{formatMonthLabel(currentDate)}</p>
          <p className="text-xs text-[var(--text-muted)]">Calendario mensal</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            aria-label="Proximo mes"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
        {WEEK_LABELS.map((label) => (
          <div key={label} className="px-2">
            {label}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {weeks.flat().map((day) => {
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const key = toDateKey(day);
          const dayPosts = postsByDate.get(key) || [];

          return (
            <div
              key={key}
              className={`min-h-[120px] rounded-[12px] border border-[var(--border)] p-2 text-xs ${
                isCurrentMonth ? "bg-white" : "bg-[var(--surface-muted)] text-[var(--text-muted)]"
              }`}
            >
              <div className="text-[11px] font-semibold text-[var(--text)]">{day.getDate()}</div>
              <div className="mt-2 space-y-1">
                {dayPosts.slice(0, 3).map((post) => {
                  const status = resolveWorkflowStatus(post);
                  const config = getWorkflowStatusConfig(status);
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => onPostClick && onPostClick(post)}
                      className={`w-full truncate rounded-[8px] px-2 py-1 text-left text-[10px] ${config.badge}`}
                    >
                      {post.title || "Post sem titulo"}
                    </button>
                  );
                })}
                {dayPosts.length > 3 ? (
                  <div className="text-[10px] text-[var(--text-muted)]">+{dayPosts.length - 3} mais</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
