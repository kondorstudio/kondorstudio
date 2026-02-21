import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, PlusCircle, Eye, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Input } from "@/components/ui/input.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import Toast from "@/components/ui/toast.jsx";
import useToast from "@/hooks/useToast.js";
import { cn } from "@/utils/classnames.js";
import { base44 } from "@/apiClient/base44Client";

const ADS_METRICS = new Set([
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "cpa",
  "conversions",
  "revenue",
  "roas",
]);
const GA4_METRICS = new Set(["sessions", "leads"]);

const CATEGORY_ORDER = ["Ads", "Executive", "GA4", "Google Ads"];

const PLATFORM_LABELS = {
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  TIKTOK_ADS: "TikTok Ads",
  LINKEDIN_ADS: "LinkedIn Ads",
  GA4: "GA4",
  GMB: "Google Meu Negócio",
  FB_IG: "Facebook/Instagram",
};

function buildInitialFilters(layout) {
  const base = {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
  };
  if (!layout?.globalFilters) return base;
  return {
    ...base,
    ...layout.globalFilters,
    dateRange: {
      ...base.dateRange,
      ...(layout.globalFilters?.dateRange || {}),
    },
  };
}

function deriveTemplateRequirements(template) {
  const requiredPlatforms = Array.isArray(template?.requiredPlatforms)
    ? template.requiredPlatforms
    : [];
  if (requiredPlatforms.length) {
    return { requiredPlatforms, requiresAds: false };
  }

  const widgets = Array.isArray(template?.layoutJson?.pages)
    ? template.layoutJson.pages.flatMap((page) =>
        Array.isArray(page?.widgets) ? page.widgets : []
      )
    : Array.isArray(template?.layoutJson?.widgets)
    ? template.layoutJson.widgets
    : [];
  const platforms = new Set();
  let requiresAds = false;

  widgets.forEach((widget) => {
    const explicit = Array.isArray(widget?.query?.requiredPlatforms)
      ? widget.query.requiredPlatforms
      : [];
    explicit.forEach((platform) => platforms.add(platform));

    const metrics = Array.isArray(widget?.query?.metrics)
      ? widget.query.metrics
      : [];
    metrics.forEach((metric) => {
      if (GA4_METRICS.has(metric)) {
        platforms.add("GA4");
      } else if (ADS_METRICS.has(metric)) {
        requiresAds = true;
      }
    });
  });

  return { requiredPlatforms: Array.from(platforms), requiresAds };
}

function formatPlatformList(list) {
  if (!Array.isArray(list) || !list.length) return "Conexões necessárias";
  return list.map((platform) => PLATFORM_LABELS[platform] || platform).join(", ");
}

export default function ReportsV2Templates() {
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  const [brandId, setBrandId] = React.useState("");
  const [nameOverride, setNameOverride] = React.useState("");
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
  const [templatesSearch, setTemplatesSearch] = React.useState("");
  const [previewTemplate, setPreviewTemplate] = React.useState(null);
  const [previewFilters, setPreviewFilters] = React.useState(buildInitialFilters(null));

  const { data: templatesData, isLoading, error } = useQuery({
    queryKey: ["reportsV2-templates"],
    queryFn: () => base44.reportsV2.listTemplates(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["reportsV2-clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  const templates = templatesData?.items || [];

  React.useEffect(() => {
    if (brandId || !clients.length) return;
    setBrandId(clients[0].id);
  }, [brandId, clients]);

  React.useEffect(() => {
    setPreviewFilters(buildInitialFilters(previewTemplate?.layoutJson));
  }, [previewTemplate]);

  React.useEffect(() => {
    setSelectedTemplateId((current) => {
      if (!current) return "";
      return templates.some((template) => template.id === current) ? current : "";
    });
  }, [templates]);

  const searchTerm = String(templatesSearch || "").trim().toLowerCase();
  const visibleTemplates = React.useMemo(() => {
    if (!searchTerm) return templates;
    return templates.filter((template) => {
      const name = String(template.name || "").toLowerCase();
      const category = String(template.category || "").toLowerCase();
      return name.includes(searchTerm) || category.includes(searchTerm);
    });
  }, [templates, searchTerm]);

  const templatesByCategory = React.useMemo(() => {
    const grouped = new Map();
    visibleTemplates.forEach((template) => {
      const category = template.category || "Outros";
      const list = grouped.get(category) || [];
      list.push(template);
      grouped.set(category, list);
    });
    const rank = new Map(CATEGORY_ORDER.map((item, index) => [item, index]));
    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const aRank = rank.has(a) ? rank.get(a) : CATEGORY_ORDER.length + 1;
      const bRank = rank.has(b) ? rank.get(b) : CATEGORY_ORDER.length + 1;
      if (aRank !== bRank) return aRank - bRank;
      return String(a).localeCompare(String(b), "pt-BR");
    });
  }, [visibleTemplates]);

  const selectedTemplate = React.useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  );
  const selectedBrandName = React.useMemo(() => {
    if (!brandId) return "";
    return clients.find((client) => client.id === brandId)?.name || "";
  }, [brandId, clients]);

  const handleSelectTemplate = React.useCallback(
    (template) => {
      if (!template?.id) return;
      if (template.id === selectedTemplateId) {
        return;
      }
      setSelectedTemplateId(template.id);
    },
    [selectedTemplateId]
  );

  const renderTemplateCard = (template) => {
    const { requiredPlatforms, requiresAds } = deriveTemplateRequirements(template);
    const requiredLabel = formatPlatformList(requiredPlatforms);
    const adsLabel = requiresAds ? " + Ads" : "";
    const selected = template.id === selectedTemplateId;

    return (
      <Card
        key={template.id}
        className={cn(
          "flex h-full cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)]",
          selected && "border-[var(--primary)] ring-1 ring-[var(--primary)]"
        )}
        onClick={() => handleSelectTemplate(template)}
      >
        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--primary-light)] text-[var(--primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-[var(--text-muted)]">
              {template.category}
            </span>
          </div>
          <div>
            <p className="text-[30px] font-semibold leading-tight text-[var(--text)]">
              {template.name}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {requiredPlatforms.length || requiresAds
                ? `Requer: ${requiredLabel}${adsLabel}`
                : "Template pronto para dashboards vivos."}
            </p>
          </div>
        </CardContent>
        <CardFooter className="min-h-[64px] border-t border-[var(--border)] bg-[#fbfdff] py-3">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-[var(--text)] hover:text-[var(--primary)]"
              onClick={(event) => {
                event.stopPropagation();
                setPreviewTemplate(template);
              }}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
            <Button
              size="sm"
              variant={selected ? "default" : "secondary"}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (selected) return;
                handleSelectTemplate(template);
              }}
              leftIcon={selected ? CheckCircle2 : PlusCircle}
            >
              {selected ? "Selecionado" : "Selecionar"}
            </Button>
            {selected ? (
              <Button
                size="sm"
                variant="default"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleContinue(template.id);
                }}
                disabled={!brandId || instantiate.isPending}
              >
                Criar agora
              </Button>
            ) : null}
            {selected ? (
              <span className="text-xs text-[var(--text-muted)]">
                {brandId ? `Marca: ${selectedBrandName}` : "Selecione uma marca"}
              </span>
            ) : null}
          </div>
        </CardFooter>
      </Card>
    );
  };

  const instantiate = useMutation({
    mutationFn: ({ templateId }) =>
      base44.reportsV2.instantiateTemplate(templateId, {
        brandId,
        nameOverride: nameOverride || undefined,
      }),
    onSuccess: (data) => {
      if (data?.dashboardId) {
        navigate(`/relatorios/v2/${data.dashboardId}/edit`);
        setPreviewTemplate(null);
        setNameOverride("");
        showToast("Dashboard criado com sucesso.", "success");
      }
    },
    onError: (error) => {
      const message =
        error?.data?.error?.message ||
        error?.message ||
        "Não foi possível criar o dashboard.";
      showToast(message, "error");
    },
  });

  const handleContinue = React.useCallback((forcedTemplateId) => {
    const templateId = forcedTemplateId || selectedTemplate?.id;
    if (!templateId) {
      showToast("Selecione um template para continuar.", "info");
      return;
    }
    if (!brandId) {
      showToast("Selecione uma marca antes de continuar.", "info");
      return;
    }
    instantiate.mutate({ templateId });
  }, [brandId, instantiate, selectedTemplate?.id, showToast]);

  return (
    <div className="kondor-reports-theme min-h-screen bg-[var(--surface-muted)]">
      <div className="border-b border-[#dbe3ed] bg-white">
        <div className="mx-auto flex h-[48px] max-w-[1760px] items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/relatorios/v2")}
              className="inline-flex h-8 items-center rounded-full border border-[#d1dae6] px-3 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            >
              Voltar
            </button>
            <p className="truncate text-[23px] font-extrabold text-[var(--primary)]">
              Nova dashboard
            </p>
          </div>
          <span className="hidden text-xs font-semibold text-[var(--text-muted)] md:inline-flex">
            Passo 1 de 2
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1760px] px-4 py-5 lg:px-6">
        <div className="kondor-reports-card p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold text-[var(--primary)]">Templates</p>
              <p className="text-sm text-[var(--text-muted)]">
                Selecione o modelo que você quer usar.
              </p>
            </div>
            <Button
              variant="secondary"
              type="button"
              onClick={() => showToast("Gerenciamento de templates em breve.", "info")}
            >
              Gerenciar templates
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_260px]">
            <Input
              placeholder="Buscar template..."
              value={templatesSearch}
              onChange={(event) => setTemplatesSearch(event.target.value)}
            />
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a marca" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3">
            <Input
              placeholder="Nome do dashboard (opcional)"
              value={nameOverride}
              onChange={(event) => setNameOverride(event.target.value)}
            />
          </div>

          <div className="mt-6 space-y-8">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={`skeleton-${index}`}>
                    <CardContent className="space-y-3">
                      <div className="h-4 w-32 rounded-full kondor-shimmer" />
                      <div className="h-3 w-40 rounded-full kondor-shimmer" />
                      <div className="h-16 w-full rounded-[12px] kondor-shimmer" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">
                Falha ao carregar templates.
              </div>
            ) : visibleTemplates.length ? (
              <>
                {templatesByCategory.map(([category, items]) => (
                  <section key={category}>
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {category}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Templates organizados por categoria.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {items.map(renderTemplateCard)}
                    </div>
                  </section>
                ))}
              </>
            ) : (
              <div className="rounded-[16px] border border-[var(--border)] bg-white px-6 py-6 text-sm text-[var(--text-muted)]">
                Nenhum template disponível para esta busca.
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="secondary" type="button" onClick={() => navigate("/relatorios/v2")}>
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleContinue}
              disabled={!brandId || !selectedTemplate || instantiate.isPending}
            >
              {instantiate.isPending ? "Criando..." : "Continuar"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(previewTemplate)} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>Preview do template</DialogTitle>
            <DialogDescription>
              Visualize o layout antes de criar o dashboard.
            </DialogDescription>
          </DialogHeader>

          {previewTemplate ? (
            <div className="rounded-[16px] border border-[var(--border)] bg-white p-4">
              <DashboardRenderer
                layout={previewTemplate.layoutJson}
                dashboardId={`preview-${previewTemplate.id}`}
                brandId={brandId || null}
                globalFilters={previewFilters}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewTemplate(null)}>
              Fechar
            </Button>
            {previewTemplate ? (
              <Button
                onClick={() => instantiate.mutate({ templateId: previewTemplate.id })}
                disabled={!brandId || instantiate.isPending}
              >
                {instantiate.isPending ? "Criando..." : "Criar em 1 clique"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toast toast={toast} />
    </div>
  );
}
