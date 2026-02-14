import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { resolveDateRange, toDateKey } from "@/components/reportsV2/utils.js";

function formatDatePtBr(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function resolveComparisonRange(filters, baseRange) {
  const compareTo = filters?.compareTo || null;
  if (!compareTo) return null;

  const startDate = new Date(`${baseRange.start}T00:00:00`);
  const endDate = new Date(`${baseRange.end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

  if (compareTo === "previous_year") {
    const prevStart = new Date(startDate);
    prevStart.setFullYear(prevStart.getFullYear() - 1);
    const prevEnd = new Date(endDate);
    prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    return { start: toDateKey(prevStart), end: toDateKey(prevEnd) };
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  const spanDays = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (spanDays - 1));
  return { start: toDateKey(prevStart), end: toDateKey(prevEnd) };
}

export default function ReporteiCoverCard({
  title = "Relatório",
  subtitle = "Análise de desempenho",
  filters,
  onAddAnalysis,
  className = "",
}) {
  const initial = String(title || "R").trim().charAt(0).toUpperCase() || "R";
  const range = resolveDateRange(filters?.dateRange || {});
  const compare = resolveComparisonRange(filters, range);

  return (
    <section className={`reportei-card overflow-hidden ${className}`.trim()}>
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-10 text-center">
        <span className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full bg-[#22A6E8] text-6xl font-extrabold text-white">
          {initial}
        </span>
        <h1 className="text-[44px] font-extrabold leading-[1.08] text-slate-900">
          {title}
        </h1>
        <p className="mt-3 text-[26px] font-semibold text-slate-500">{subtitle}</p>
        <p className="mx-auto mt-8 max-w-[840px] text-[18px] leading-relaxed text-slate-700">
          Relatório gerado dos dados analisados entre {formatDatePtBr(range.start)} e{" "}
          {formatDatePtBr(range.end)}
          {compare
            ? ` comparado com os dados coletados entre ${formatDatePtBr(compare.start)} e ${formatDatePtBr(compare.end)}.`
            : "."}
        </p>
        <div className="mt-14">
          <Button
            size="sm"
            variant="secondary"
            onClick={onAddAnalysis}
            disabled={!onAddAnalysis}
            data-testid="cover-add-analysis"
            className="h-8 rounded-full border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Clique aqui para adicionar uma análise
          </Button>
        </div>
      </div>
    </section>
  );
}
