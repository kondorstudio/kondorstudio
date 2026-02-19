// front/src/pages/admin/AdminJobs.jsx
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Input } from "@/components/ui/input.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Loader2 } from "lucide-react";

const PAGE_SIZE = 20;

const jobStatusOptions = [
  { value: "FAILED", label: "Falhados" },
  { value: "RETRYING", label: "Reprocessando" },
  { value: "COMPLETED", label: "Concluídos" },
];

const syncStatusOptions = [
  { value: "all", label: "Todos" },
  { value: "FAILED", label: "FAILED" },
  { value: "RUNNING", label: "RUNNING" },
  { value: "QUEUED", label: "QUEUED" },
  { value: "SUCCESS", label: "SUCCESS" },
  { value: "PARTIAL_SUCCESS", label: "PARTIAL_SUCCESS" },
  { value: "CANCELLED", label: "CANCELLED" },
];

const syncRunTypeOptions = [
  { value: "all", label: "Todos" },
  { value: "PREVIEW", label: "PREVIEW" },
  { value: "BACKFILL", label: "BACKFILL" },
  { value: "INCREMENTAL", label: "INCREMENTAL" },
];

const windowOptions = [
  { value: "6", label: "6h" },
  { value: "24", label: "24h" },
  { value: "72", label: "72h" },
  { value: "168", label: "7d" },
];

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeVariant(status) {
  if (status === "FAILED") return "danger";
  if (status === "RUNNING" || status === "RETRYING" || status === "QUEUED") return "warning";
  if (status === "SUCCESS" || status === "COMPLETED") return "success";
  return "outline";
}

export default function AdminJobs() {
  const [filters, setFilters] = useState({
    queue: "",
    status: "FAILED",
    tenantId: "",
    search: "",
    since: "",
    provider: "",
    syncStatus: "all",
    runType: "all",
    sinceHours: "24",
  });
  const [page, setPage] = useState(1);
  const [syncPage, setSyncPage] = useState(1);

  const jobsQueryKey = useMemo(
    () => ["admin-jobs", { ...filters, page }],
    [filters, page],
  );

  const syncRunsQueryKey = useMemo(
    () => ["admin-sync-runs", { ...filters, syncPage }],
    [filters, syncPage],
  );

  const syncSummaryQueryKey = useMemo(
    () => ["admin-sync-summary", { ...filters }],
    [filters],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: jobsQueryKey,
    queryFn: () =>
      base44.admin.jobs({
        page,
        pageSize: PAGE_SIZE,
        queue: filters.queue || undefined,
        status: filters.status || undefined,
        tenantId: filters.tenantId || undefined,
        search: filters.search || undefined,
        since: filters.since || undefined,
      }),
    keepPreviousData: true,
  });

  const {
    data: syncRunsData,
    isLoading: isSyncRunsLoading,
    isFetching: isSyncRunsFetching,
  } = useQuery({
    queryKey: syncRunsQueryKey,
    queryFn: () =>
      base44.admin.syncRuns({
        page: syncPage,
        pageSize: PAGE_SIZE,
        tenantId: filters.tenantId || undefined,
        provider: filters.provider || undefined,
        status: filters.syncStatus !== "all" ? filters.syncStatus : undefined,
        runType: filters.runType !== "all" ? filters.runType : undefined,
        since: filters.since || undefined,
      }),
    keepPreviousData: true,
  });

  const {
    data: syncSummaryData,
    isLoading: isSyncSummaryLoading,
    isFetching: isSyncSummaryFetching,
  } = useQuery({
    queryKey: syncSummaryQueryKey,
    queryFn: () =>
      base44.admin.syncSummary({
        sinceHours: filters.sinceHours || 24,
        tenantId: filters.tenantId || undefined,
        provider: filters.provider || undefined,
      }),
    keepPreviousData: true,
  });

  const jobs = data?.jobs || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: jobs.length };

  const syncRuns = syncRunsData?.runs || [];
  const syncPagination =
    syncRunsData?.pagination || { page: 1, totalPages: 1, total: syncRuns.length };

  const syncSummary = syncSummaryData?.summary || null;

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(1);
    setSyncPage(1);
  };

  const resetFilters = () => {
    setFilters({
      queue: "",
      status: "FAILED",
      tenantId: "",
      search: "",
      since: "",
      provider: "",
      syncStatus: "all",
      runType: "all",
      sinceHours: "24",
    });
    setPage(1);
    setSyncPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-wide text-gray-500">Jobs e filas</p>
        <h1 className="text-3xl font-bold text-gray-900 mt-1">Monitoramento de workers</h1>
        <p className="text-gray-600 mt-1">
          Acompanhe falhas de filas e execução de syncs por provider.
        </p>
      </div>

      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base text-gray-900">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Fila (job log)</label>
            <Input
              value={filters.queue}
              onChange={(e) => updateFilter("queue", e.target.value)}
              placeholder="ex: ga4-sync"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Status (job log)</label>
            <Select value={filters.status} onValueChange={(val) => updateFilter("status", val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jobStatusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Provider (sync)</label>
            <Input
              value={filters.provider}
              onChange={(e) => updateFilter("provider", e.target.value)}
              placeholder="ex: GA4 / META"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Status (sync)</label>
            <Select value={filters.syncStatus} onValueChange={(val) => updateFilter("syncStatus", val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {syncStatusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Tipo (sync)</label>
            <Select value={filters.runType} onValueChange={(val) => updateFilter("runType", val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {syncRunTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Janela (summary sync)</label>
            <Select value={filters.sinceHours} onValueChange={(val) => updateFilter("sinceHours", val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {windowOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Tenant ID</label>
            <Input
              value={filters.tenantId}
              onChange={(e) => updateFilter("tenantId", e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Buscar em erros (job log)</label>
            <Input
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder="Mensagem parcial"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Desde (job/sync)</label>
            <DateField
              value={filters.since}
              onChange={(e) => updateFilter("since", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-gray-500">Runs (janela)</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {isSyncSummaryLoading ? "—" : syncSummary?.totals?.runs ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-gray-500">Errors (janela)</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {isSyncSummaryLoading ? "—" : syncSummary?.totals?.errors ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-gray-500">Chunks falhados</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {isSyncSummaryLoading ? "—" : syncSummary?.totals?.chunksFailed ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-gray-500">Runs FAILED</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {isSyncSummaryLoading ? "—" : syncSummary?.totals?.byStatus?.FAILED ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Sync runs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Provider</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Rows</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Chunks/Erros</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {syncRuns.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">{run.provider || "—"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{run.runType || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadgeVariant(run.status)} className="text-xs">
                      {run.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {run.rowsWritten ?? 0}/{run.rowsRead ?? 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {run.chunksCount ?? 0}/{run.errorsCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(run.createdAt)}</td>
                </tr>
              ))}
              {!isSyncRunsLoading && syncRuns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nenhum sync run encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(isSyncRunsLoading || isSyncRunsFetching || isSyncSummaryFetching) && (
          <div className="flex items-center gap-2 p-4 text-sm text-gray-500 border-t border-gray-100">
            <Loader2 className="w-4 h-4 animate-spin" /> Atualizando observabilidade de sync...
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 text-sm text-gray-600 border-t border-gray-100">
          <span>
            Página {syncPagination.page} de {syncPagination.totalPages || 1} — {syncPagination.total} runs
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={syncPagination.page <= 1}
              onClick={() => setSyncPage((prev) => Math.max(prev - 1, 1))}
              className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={syncPagination.page >= (syncPagination.totalPages || 1)}
              onClick={() =>
                setSyncPage((prev) => Math.min(prev + 1, syncPagination.totalPages || prev + 1))
              }
              className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Job logs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Fila</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Erro</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tenant</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tentativas</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {job.queue}
                      </Badge>
                      <Badge variant={statusBadgeVariant(job.status)} className="text-xs">
                        {job.status}
                      </Badge>
                    </div>
                    {job.jobId && (
                      <p className="text-xs text-gray-500 mt-1">Job ID: {job.jobId}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-800 line-clamp-3">{job.error || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{job.tenantId || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{job.attempts ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(job.createdAt)}</td>
                </tr>
              ))}
              {!isLoading && jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <p>Nenhum job encontrado com os filtros atuais.</p>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(isLoading || isFetching) && (
          <div className="flex items-center gap-2 p-4 text-sm text-gray-500 border-t border-gray-100">
            <Loader2 className="w-4 h-4 animate-spin" /> Atualizando job logs...
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 text-sm text-gray-600 border-t border-gray-100">
          <span>
            Página {pagination.page} de {pagination.totalPages || 1} — {pagination.total} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={pagination.page >= (pagination.totalPages || 1)}
              onClick={() =>
                setPage((prev) => Math.min(prev + 1, pagination.totalPages || prev + 1))
              }
              className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
