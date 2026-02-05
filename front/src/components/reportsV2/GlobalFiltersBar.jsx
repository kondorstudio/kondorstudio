import React from "react";
import { Filter, Calendar, RefreshCw, UserRound, ChevronDown, ChevronUp } from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { Input } from "@/components/ui/input.jsx";
import { cn } from "@/utils/classnames.js";
import { DEFAULT_FILTER_CONTROLS, expandPlatformFilters } from "@/components/reportsV2/utils.js";

const PLATFORM_OPTIONS = [
  { value: "META_ADS", label: "Meta Ads" },
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "TIKTOK_ADS", label: "TikTok Ads" },
  { value: "LINKEDIN_ADS", label: "LinkedIn Ads" },
  { value: "GA4", label: "GA4" },
  { value: "GMB", label: "Google Meu Negócio" },
  { value: "FB_IG", label: "FB/IG" },
];

function normalizeAccountIds(rawValue) {
  const raw = String(rawValue || "");
  const values = raw
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

export default function GlobalFiltersBar({
  filters,
  onChange,
  controls,
  connections,
  className = "",
  collapsible = true,
  defaultCollapsed = false,
}) {
  const platforms = Array.isArray(filters?.platforms) ? filters.platforms : [];
  const compareTo = filters?.compareTo || "none";
  const autoRefreshSec = String(filters?.autoRefreshSec ?? 0);
  const preset = filters?.dateRange?.preset || "last_7_days";
  const accounts = Array.isArray(filters?.accounts) ? filters.accounts : [];
  const effectiveControls = {
    ...DEFAULT_FILTER_CONTROLS,
    ...(filters?.controls || {}),
    ...(controls || {}),
  };

  const accountIds = React.useMemo(
    () =>
      accounts
        .map((item) =>
          typeof item === "string" ? item : item?.external_account_id
        )
        .filter(Boolean),
    [accounts]
  );

  const accountInputValue = accountIds.join(", ");

  const expandedPlatforms = React.useMemo(
    () => expandPlatformFilters(platforms),
    [platforms]
  );
  const primaryPlatform =
    expandedPlatforms[0] ||
    (typeof accounts[0] === "object" ? accounts[0]?.platform : null) ||
    "META_ADS";
  const [collapsed, setCollapsed] = React.useState(Boolean(defaultCollapsed));

  const togglePlatform = (value) => {
    const next = platforms.includes(value)
      ? platforms.filter((item) => item !== value)
      : [...platforms, value];
    onChange({ ...filters, platforms: next });
  };

  const handleAccountsChange = (value) => {
    const ids = normalizeAccountIds(value);
    onChange({
      ...filters,
      accounts: ids.map((id) => ({
        platform: primaryPlatform,
        external_account_id: id,
      })),
    });
  };

  const activeConnections = React.useMemo(() => {
    if (!Array.isArray(connections)) return [];
    return connections.filter(
      (item) => String(item?.status || "").toUpperCase() === "ACTIVE"
    );
  }, [connections]);

  const availableAccounts = React.useMemo(() => {
    if (!activeConnections.length) return [];
    if (!expandedPlatforms.length) return activeConnections;
    const allowed = new Set(expandedPlatforms);
    return activeConnections.filter((item) => allowed.has(item.platform));
  }, [activeConnections, expandedPlatforms]);

  const selectedAccountKey = React.useMemo(() => {
    const set = new Set();
    accounts.forEach((item) => {
      if (!item) return;
      if (typeof item === "string") {
        set.add(item);
        return;
      }
      if (item.external_account_id) {
        set.add(`${item.platform || "unknown"}:${item.external_account_id}`);
      }
    });
    return set;
  }, [accounts]);

  const toggleAccount = (account) => {
    if (!account?.externalAccountId && !account?.external_account_id) return;
    const accountId = account.externalAccountId || account.external_account_id;
    const platform = account.platform || primaryPlatform;
    const key = `${platform}:${accountId}`;
    const next = new Map();
    accounts.forEach((item) => {
      if (!item) return;
      if (typeof item === "string") {
        next.set(`unknown:${item}`, { platform: primaryPlatform, external_account_id: item });
        return;
      }
      if (item.external_account_id) {
        next.set(`${item.platform || "unknown"}:${item.external_account_id}`, item);
      }
    });
    if (selectedAccountKey.has(key)) {
      next.delete(key);
    } else {
      next.set(key, { platform, external_account_id: accountId });
    }
    onChange({ ...filters, accounts: Array.from(next.values()) });
  };

  const handleSelectAllAccounts = () => {
    if (!availableAccounts.length) return;
    const next = new Map();
    availableAccounts.forEach((account) => {
      const accountId = account.externalAccountId || account.external_account_id;
      if (!accountId) return;
      const platform = account.platform || primaryPlatform;
      const key = `${platform}:${accountId}`;
      next.set(key, { platform, external_account_id: accountId });
    });
    onChange({ ...filters, accounts: Array.from(next.values()) });
  };

  const handleClearAccounts = () => {
    onChange({ ...filters, accounts: [] });
  };

  return (
    <FilterBar className={cn("gap-4 bg-[var(--card)]", className)}>
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <Filter className="h-4 w-4 text-[var(--muted)]" />
          Filtros globais
        </div>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {collapsed ? "Expandir" : "Recolher"}
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="flex flex-wrap items-end gap-3">
        {effectiveControls.showDateRange !== false ? (
          <>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Período
              </label>
              <Select
                value={preset}
                onValueChange={(value) =>
                  onChange({
                    ...filters,
                    dateRange: {
                      ...filters?.dateRange,
                      preset: value,
                      start: value === "custom" ? filters?.dateRange?.start || "" : "",
                      end: value === "custom" ? filters?.dateRange?.end || "" : "",
                    },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                  <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                  <SelectItem value="custom">Customizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {preset === "custom" ? (
              <>
                <div className="min-w-[160px]">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    Inicio
                  </label>
                  <DateField
                    value={filters?.dateRange?.start || ""}
                    onChange={(event) =>
                      onChange({
                        ...filters,
                        dateRange: { ...filters?.dateRange, start: event.target.value },
                      })
                    }
                    placeholder="dd/mm/aaaa"
                  />
                </div>
                <div className="min-w-[160px]">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    Fim
                  </label>
                  <DateField
                    value={filters?.dateRange?.end || ""}
                    onChange={(event) =>
                      onChange({
                        ...filters,
                        dateRange: { ...filters?.dateRange, end: event.target.value },
                      })
                    }
                    placeholder="dd/mm/aaaa"
                  />
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {effectiveControls.showPlatforms !== false ? (
          <div className="min-w-[200px]">
              <label className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                <Calendar className="h-3.5 w-3.5" />
                Plataformas
              </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((platform) => {
                const active = platforms.includes(platform.value);
                return (
                  <button
                    type="button"
                    key={platform.value}
                    onClick={() => togglePlatform(platform.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      active
                        ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-slate-300"
                    )}
                  >
                    {platform.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {effectiveControls.showAccounts !== false ? (
          <div className="min-w-[220px]">
              <label
                htmlFor="global-filter-accounts"
                className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]"
              >
                <UserRound className="h-3.5 w-3.5" />
                Contas
              </label>
            <Input
              id="global-filter-accounts"
              value={accountInputValue}
              onChange={(event) => handleAccountsChange(event.target.value)}
              placeholder="acc_123, acc_456"
              aria-label="Filtro de contas"
            />
            {availableAccounts.length ? (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableAccounts.map((account) => {
                    const accountId =
                      account.externalAccountId || account.external_account_id;
                    const key = `${account.platform || "unknown"}:${accountId}`;
                    const active = selectedAccountKey.has(key);
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => toggleAccount(account)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                          active
                            ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                            : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-slate-300"
                        )}
                      >
                        {account.externalAccountName || accountId}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllAccounts}
                    className="text-xs font-semibold text-[var(--primary)] hover:underline"
                  >
                    Selecionar todas
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAccounts}
                    className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    Limpar seleção
                  </button>
                </div>
              </>
            ) : null}
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Selecione contas abaixo ou informe IDs separados por vírgula. Plataforma ativa:{" "}
              {primaryPlatform}
            </p>
          </div>
        ) : null}

        <div className="min-w-[180px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Comparação
          </label>
          <Select
            value={compareTo}
            onValueChange={(value) =>
              onChange({
                ...filters,
                compareTo: value === "none" ? null : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Sem comparação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem comparação</SelectItem>
              <SelectItem value="previous_period">Período anterior</SelectItem>
              <SelectItem value="previous_year">Ano anterior</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[160px]">
          <label className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualização automática
          </label>
          <Select
            value={autoRefreshSec}
            onValueChange={(value) =>
              onChange({
                ...filters,
                autoRefreshSec: Number(value),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Desligado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Desligado</SelectItem>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
              <SelectItem value="300">5min</SelectItem>
            </SelectContent>
          </Select>
        </div>
        </div>
      ) : (
        <div className="text-xs text-[var(--muted)]">
          Filtros recolhidos. Clique em "Expandir" para ajustar data, plataforma e contas.
        </div>
      )}
    </FilterBar>
  );
}
