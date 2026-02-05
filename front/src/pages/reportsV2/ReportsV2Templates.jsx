import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, PlusCircle, Eye, Star } from "lucide-react";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
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
import { base44 } from "@/apiClient/base44Client";

const themeStyle = {
  "--background": "#FFFFFF",
  "--surface": "#FFFFFF",
  "--surface-muted": "#F8FAFC",
  "--border": "#E2E8F0",
  "--text": "#0F172A",
  "--text-muted": "#64748B",
  "--primary": "#B050F0",
  "--primary-dark": "#9515EA",
  "--accent": "#22C55E",
  "--shadow-sm": "0 2px 6px rgba(15, 23, 42, 0.08)",
  "--shadow-md": "0 18px 32px rgba(15, 23, 42, 0.12)",
  "--radius-card": "16px",
  "--radius-button": "16px",
  "--radius-input": "12px",
};

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
const ADS_PLATFORMS = [
  "META_ADS",
  "GOOGLE_ADS",
  "TIKTOK_ADS",
  "LINKEDIN_ADS",
  "FB_IG",
];

const PLATFORM_LABELS = {
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  TIKTOK_ADS: "TikTok Ads",
  LINKEDIN_ADS: "LinkedIn Ads",
  GA4: "GA4",
  GMB: "Google Meu Negocio",
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
  if (!Array.isArray(list) || !list.length) return "Conexoes necessarias";
  return list.map((platform) => PLATFORM_LABELS[platform] || platform).join(", ");
}

export default function ReportsV2Templates() {
  const navigate = useNavigate();
  const [brandId, setBrandId] = React.useState("");
  const [nameOverride, setNameOverride] = React.useState("");
  const [previewTemplate, setPreviewTemplate] = React.useState(null);
  const [previewFilters, setPreviewFilters] = React.useState(buildInitialFilters(null));
  const [createdDashboardId, setCreatedDashboardId] = React.useState(null);
  const [showCreatedDialog, setShowCreatedDialog] = React.useState(false);

  const { data: templatesData, isLoading, error } = useQuery({
    queryKey: ["reportsV2-templates"],
    queryFn: () => base44.reportsV2.listTemplates(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["reportsV2-clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  const { data: connectionsData } = useQuery({
    queryKey: ["reportsV2-connections", brandId],
    queryFn: () => base44.reportsV2.listConnections({ brandId }),
    enabled: Boolean(brandId),
  });

  React.useEffect(() => {
    if (brandId || !clients.length) return;
    setBrandId(clients[0].id);
  }, [brandId, clients]);

  React.useEffect(() => {
    setPreviewFilters(buildInitialFilters(previewTemplate?.layoutJson));
  }, [previewTemplate]);

  const templates = templatesData?.items || [];
  const connections = connectionsData?.items || [];
  const activePlatforms = React.useMemo(() => {
    const set = new Set();
    connections.forEach((conn) => {
      if (conn.status === "ACTIVE") {
        set.add(conn.platform);
      }
    });
    return set;
  }, [connections]);

  const recommendedTemplates = React.useMemo(() => {
    if (!templates.length) return [];
    return templates.filter((template) => {
      const { requiredPlatforms, requiresAds } = deriveTemplateRequirements(template);
      let ok = true;
      if (requiredPlatforms.length) {
        ok = requiredPlatforms.every((platform) => activePlatforms.has(platform));
      }
      if (requiresAds) {
        ok = ok && ADS_PLATFORMS.some((platform) => activePlatforms.has(platform));
      }
      return ok;
    });
  }, [templates, activePlatforms]);

  const recommendedIds = React.useMemo(
    () => new Set(recommendedTemplates.map((template) => template.id)),
    [recommendedTemplates]
  );

  const templatesByCategory = React.useMemo(() => {
    const grouped = new Map();
    templates.forEach((template) => {
      const category = template.category || "Outros";
      const list = grouped.get(category) || [];
      list.push(template);
      grouped.set(category, list);
    });
    return Array.from(grouped.entries());
  }, [templates]);

  const renderTemplateCard = (template) => {
    const { requiredPlatforms, requiresAds } = deriveTemplateRequirements(template);
    const isRecommended = recommendedIds.has(template.id);
    const requiredLabel = formatPlatformList(requiredPlatforms);
    const adsLabel = requiresAds ? " + Ads" : "";

    return (
      <Card key={template.id} className="flex h-full flex-col">
        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--primary-light)] text-[var(--primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              {isRecommended ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase text-emerald-700">
                  <Star className="h-3.5 w-3.5" />
                  Recomendado
                </span>
              ) : null}
              <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                {template.category}
              </span>
            </div>
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--text)]">
              {template.name}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {requiredPlatforms.length || requiresAds
                ? `Requer: ${requiredLabel}${adsLabel}`
                : "Template pronto para dashboards vivos."}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPreviewTemplate(template)}
              leftIcon={Eye}
            >
              Preview
            </Button>
            <Button
              size="sm"
              onClick={() => instantiate.mutate({ templateId: template.id })}
              disabled={!brandId || instantiate.isLoading}
              leftIcon={PlusCircle}
            >
              Criar
            </Button>
          </div>
          {!brandId ? (
            <span className="text-xs text-[var(--text-muted)]">
              Selecione uma marca
            </span>
          ) : null}
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
        setCreatedDashboardId(data.dashboardId);
        setShowCreatedDialog(true);
        setPreviewTemplate(null);
        setNameOverride("");
      }
    },
  });

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <PageShell>
        <PageHeader
          kicker="Templates"
          title="Galeria de templates"
          subtitle="Escolha um template e crie um dashboard em 1 clique."
          actions={
            <Button variant="secondary" onClick={() => navigate("/relatorios/v2")}>
              Voltar para dashboards
            </Button>
          }
        />

        <div className="mt-8 flex flex-wrap gap-4 rounded-[16px] border border-[var(--border)] bg-white p-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Marca
            </label>
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
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Nome do dashboard (opcional)
            </label>
            <Input
              placeholder="Ex: Ads Overview - Janeiro"
              value={nameOverride}
              onChange={(event) => setNameOverride(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
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
          ) : templates.length ? (
            <>
              {recommendedTemplates.length ? (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        Recomendados
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Baseado nas conexoes ativas desta marca.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {recommendedTemplates.map(renderTemplateCard)}
                  </div>
                </section>
              ) : null}

              {templatesByCategory.map(([category, items]) => (
                <section key={category}>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {category}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Templates organizados por categoria.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(renderTemplateCard)}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <div className="rounded-[16px] border border-[var(--border)] bg-white px-6 py-6 text-sm text-[var(--text-muted)]">
              Nenhum template disponivel.
            </div>
          )}
        </div>
      </PageShell>

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
                disabled={!brandId || instantiate.isLoading}
              >
                {instantiate.isLoading ? "Criando..." : "Criar em 1 clique"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreatedDialog} onOpenChange={setShowCreatedDialog}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Dashboard criado</DialogTitle>
            <DialogDescription>
              Deseja abrir no viewer ou no editor?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreatedDialog(false)}>
              Fechar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreatedDialog(false);
                if (createdDashboardId) {
                  navigate(`/relatorios/v2/${createdDashboardId}`);
                }
              }}
            >
              Abrir viewer
            </Button>
            <Button
              onClick={() => {
                setShowCreatedDialog(false);
                if (createdDashboardId) {
                  navigate(`/relatorios/v2/${createdDashboardId}/edit`);
                }
              }}
            >
              Abrir editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
