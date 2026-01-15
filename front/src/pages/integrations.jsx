import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "../apiClient/base44Client";

import { Button } from "@/components/ui/button.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import {
  RefreshCw,
  Megaphone,
  BarChart3,
  MessageCircle,
  Music,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
  MapPin,
  Pin,
} from "lucide-react";

import IntegrationTile from "@/components/integrations/IntegrationTile.jsx";
import IntegrationConnectDialog from "@/components/integrations/IntegrationConnectDialog.jsx";
import { useActiveClient } from "@/hooks/useActiveClient.js";
import { SelectNative } from "@/components/ui/select-native.jsx";

const DEFAULT_OWNER_KEY = "AGENCY";

const INTEGRATION_CATALOG = [
  {
    key: "facebook",
    title: "Facebook",
    subtitle: "Paginas e publicacoes",
    description: "Conecte paginas para publicar posts automaticamente.",
    provider: "META",
    ownerKey: "META_BUSINESS",
    kind: "meta_business",
    scope: "client",
    accentClass: "from-blue-500 to-indigo-500",
    icon: Facebook,
    dialogDescription:
      "Informe os dados da pagina do Facebook usada para publicar.",
    oauth: {
      title: "Conexao oficial via Meta",
      subtitle: "Recomendado para paginas e Instagram Business.",
      label: "Conectar via Meta",
      endpoint: "/integrations/meta/connect-url",
    },
    fields: [
      {
        name: "pageId",
        label: "ID da Pagina do Facebook",
        placeholder: "1234567890",
        required: true,
      },
      {
        name: "igBusinessId",
        label: "ID do Instagram Business",
        placeholder: "17841400000000000",
        required: false,
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "EAAB...",
        required: true,
        helper: "Permissoes: pages_manage_posts, instagram_content_publish.",
      },
    ],
  },
  {
    key: "instagram",
    title: "Instagram",
    subtitle: "Somente Instagram",
    description: "Ideal quando o cliente quer postar apenas no Instagram.",
    provider: "META",
    ownerKey: "INSTAGRAM",
    kind: "instagram_only",
    scope: "client",
    accentClass: "from-pink-500 to-orange-500",
    icon: Instagram,
    dialogDescription:
      "Conecte uma conta Instagram Business para publicar.",
    oauth: {
      title: "Conexao oficial via Meta",
      subtitle: "Use o login Meta para conectar o Instagram Business.",
      label: "Conectar via Meta",
      endpoint: "/integrations/meta/connect-url",
    },
    fields: [
      {
        name: "igBusinessId",
        label: "Instagram Business ID",
        placeholder: "17841400000000000",
        required: true,
      },
      {
        name: "pageId",
        label: "ID da Pagina do Facebook (opcional)",
        placeholder: "1234567890",
        required: false,
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "EAAB...",
        required: true,
      },
    ],
  },
  {
    key: "linkedin",
    title: "LinkedIn",
    subtitle: "Conteudos profissionais",
    description: "Publique e acompanhe metricas do LinkedIn.",
    provider: "LINKEDIN",
    ownerKey: "LINKEDIN",
    kind: "linkedin",
    scope: "client",
    accentClass: "from-sky-500 to-blue-500",
    icon: Linkedin,
    comingSoon: true,
  },
  {
    key: "tiktok",
    title: "TikTok",
    subtitle: "Publicacoes automaticas",
    description: "Publique videos e acompanhe a agenda do cliente.",
    provider: "TIKTOK",
    ownerKey: "TIKTOK",
    kind: "tiktok",
    scope: "client",
    accentClass: "from-fuchsia-500 to-rose-500",
    icon: Music,
    dialogDescription:
      "Informe as credenciais do aplicativo TikTok para postagem.",
    fields: [
      {
        name: "appId",
        label: "App ID",
        placeholder: "tt_app_id",
        required: true,
      },
      {
        name: "appSecret",
        label: "App Secret",
        type: "password",
        placeholder: "tt_secret",
        required: true,
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "tiktok_access_token",
        required: true,
      },
      {
        name: "openId",
        label: "Open ID (opcional)",
        placeholder: "open_id",
        required: false,
      },
    ],
  },
  {
    key: "google-business",
    title: "Google Meu Negocio",
    subtitle: "Perfil da empresa",
    description: "Gerencie posts e visibilidade no Google.",
    provider: "GOOGLE",
    ownerKey: "GOOGLE_BUSINESS",
    kind: "google_business",
    scope: "client",
    accentClass: "from-amber-500 to-orange-500",
    icon: MapPin,
    comingSoon: true,
  },
  {
    key: "pinterest",
    title: "Pinterest",
    subtitle: "Conteudos visuais",
    description: "Conecte pins e acompanhe performance.",
    provider: "PINTEREST",
    ownerKey: "PINTEREST",
    kind: "pinterest",
    scope: "client",
    accentClass: "from-rose-500 to-red-500",
    icon: Pin,
    comingSoon: true,
  },
  {
    key: "youtube",
    title: "YouTube",
    subtitle: "Videos e shorts",
    description: "Publique videos e acompanhe metricas.",
    provider: "GOOGLE",
    ownerKey: "YOUTUBE",
    kind: "youtube",
    scope: "client",
    accentClass: "from-red-500 to-rose-500",
    icon: Youtube,
    comingSoon: true,
  },
  {
    key: "threads",
    title: "Threads",
    subtitle: "Conteudos rapidos",
    description: "Integre o Threads para posts e insights.",
    provider: "META",
    ownerKey: "THREADS",
    kind: "threads",
    scope: "client",
    accentClass: "from-slate-600 to-slate-900",
    icon: MessageCircle,
    comingSoon: true,
  },
  {
    key: "google-analytics",
    title: "Google Analytics 4",
    subtitle: "GA4 + relatorios",
    description: "Extraia metricas do site e exporte relatorios automatizados.",
    provider: "GOOGLE",
    ownerKey: "GA4",
    kind: "google_analytics",
    scope: "client",
    accentClass: "from-amber-500 to-orange-500",
    icon: BarChart3,
    dialogDescription:
      "Cadastre a propriedade GA4 e as credenciais de acesso.",
    fields: [
      {
        name: "propertyId",
        label: "GA4 Property ID",
        placeholder: "123456789",
        required: true,
      },
      {
        name: "measurementId",
        label: "Measurement ID (opcional)",
        placeholder: "G-XXXXXXX",
        required: false,
      },
      {
        name: "serviceAccountJson",
        label: "Service Account JSON",
        type: "textarea",
        placeholder: "{\n  \"type\": \"service_account\"\n}",
        required: true,
        format: "json",
      },
    ],
  },
  {
    key: "x",
    title: "X",
    subtitle: "Atualizacoes rapidas",
    description: "Gerencie posts e acompanhamento no X.",
    provider: "X",
    ownerKey: "X",
    kind: "x",
    scope: "client",
    accentClass: "from-slate-500 to-slate-700",
    icon: Twitter,
    comingSoon: true,
  },
  {
    key: "meta-ads",
    title: "Meta Ads",
    subtitle: "Metricas e relatorios",
    description: "Importe resultados de campanhas para dashboards.",
    provider: "META",
    ownerKey: "META_ADS",
    kind: "meta_ads",
    scope: "client",
    accentClass: "from-sky-500 to-cyan-500",
    icon: Megaphone,
    dialogDescription:
      "Configure a conta de anuncios usada para coletar metricas.",
    oauth: {
      title: "Conexao oficial via Meta Ads",
      subtitle: "Recomendado para acesso continuo as campanhas.",
      label: "Conectar via Meta",
      endpoint: "/integrations/meta/connect-url",
    },
    fields: [
      {
        name: "adAccountId",
        label: "Ad Account ID",
        placeholder: "act_1234567890",
        required: true,
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "EAAB...",
        required: true,
      },
      {
        name: "fields",
        label: "Metricas (opcional)",
        placeholder: "impressions,clicks,spend",
        required: false,
      },
    ],
  },
  {
    key: "google-ads",
    title: "Google Ads",
    subtitle: "Metricas e campanhas",
    description: "Acompanhe campanhas e conversoes.",
    provider: "GOOGLE_ADS",
    ownerKey: "GOOGLE_ADS",
    kind: "google_ads",
    scope: "client",
    accentClass: "from-yellow-500 to-orange-500",
    icon: Megaphone,
    comingSoon: true,
  },
  {
    key: "linkedin-ads",
    title: "LinkedIn Ads",
    subtitle: "Campanhas B2B",
    description: "Relatorios e desempenho no LinkedIn.",
    provider: "LINKEDIN",
    ownerKey: "LINKEDIN_ADS",
    kind: "linkedin_ads",
    scope: "client",
    accentClass: "from-sky-500 to-blue-600",
    icon: Megaphone,
    comingSoon: true,
  },
  {
    key: "tiktok-ads",
    title: "TikTok Ads",
    subtitle: "Campanhas e anuncios",
    description: "Dados de campanhas e criativos.",
    provider: "TIKTOK",
    ownerKey: "TIKTOK_ADS",
    kind: "tiktok_ads",
    scope: "client",
    accentClass: "from-fuchsia-500 to-rose-600",
    icon: Megaphone,
    comingSoon: true,
  },
  {
    key: "whatsapp-business",
    title: "WhatsApp Business",
    subtitle: "Aprovacoes via WhatsApp",
    description: "Envio automatico de aprovacoes e respostas do cliente.",
    provider: "WHATSAPP_META_CLOUD",
    ownerKey: "AGENCY",
    kind: "whatsapp_business",
    scope: "agency",
    accentClass: "from-emerald-500 to-lime-500",
    icon: MessageCircle,
    dialogDescription:
      "Preencha os dados do WhatsApp Business Cloud API para envio.",
    oauth: {
      title: "Conexao oficial via Meta",
      subtitle: "Recomendado para webhooks e envio automatico.",
      label: "Conectar via Meta",
      endpoint: "/integrations/whatsapp/connect-url",
    },
    fields: [
      {
        name: "wabaId",
        label: "WABA ID",
        placeholder: "104857600000000",
        required: true,
      },
      {
        name: "phoneNumberId",
        label: "Phone Number ID",
        placeholder: "106907000000000",
        required: true,
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "EAAB...",
        required: true,
      },
      {
        name: "verifyToken",
        label: "Verify Token (webhook)",
        placeholder: "defina-um-token",
        required: false,
      },
    ],
  },
];

function buildIntegrationKey(provider, ownerKey) {
  return `${provider}:${ownerKey || DEFAULT_OWNER_KEY}`;
}

function isConnectedStatus(status) {
  const value = String(status || "").toLowerCase();
  return value === "connected" || value === "active";
}

function resolveMetaKey(kind) {
  const normalized = String(kind || "").toLowerCase();
  if (normalized === "meta_ads") return "meta-ads";
  if (normalized === "instagram_only") return "instagram";
  return "facebook";
}

export default function Integrations() {
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState(null);
  const [comingSoonDefinition, setComingSoonDefinition] = useState(null);
  const [initialClientId, setInitialClientId] = useState("");
  const [activeClientId, setActiveClientId] = useActiveClient();
  const [selectedClientId, setSelectedClientId] = useState(activeClientId || "");
  const location = useLocation();
  const queryClient = useQueryClient();

  const {
    data: integrations = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => base44.entities.Integration.list(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const integrationsByKey = useMemo(() => {
    const map = new Map();
    (integrations || []).forEach((integration) => {
      map.set(
        buildIntegrationKey(integration.provider, integration.ownerKey),
        integration
      );
    });
    return map;
  }, [integrations]);

  const connectableCatalog = useMemo(
    () => INTEGRATION_CATALOG.filter((item) => !item.comingSoon),
    []
  );

  const connectedCount = useMemo(() => {
    return connectableCatalog.reduce((acc, item) => {
      if (item.scope === "client") {
        const matches = (integrations || []).filter(
          (integration) =>
            integration.ownerType === "CLIENT" &&
            integration.provider === item.provider &&
            (!item.kind || integration.settings?.kind === item.kind)
        );
        return acc + (matches.some((entry) => isConnectedStatus(entry.status)) ? 1 : 0);
      }
      const record = integrationsByKey.get(
        buildIntegrationKey(item.provider, item.ownerKey)
      );
      return acc + (isConnectedStatus(record?.status) ? 1 : 0);
    }, 0);
  }, [connectableCatalog, integrations, integrationsByKey]);

  const agencyIntegrations = useMemo(
    () => INTEGRATION_CATALOG.filter((item) => item.scope === "agency"),
    []
  );
  const clientIntegrations = useMemo(
    () => INTEGRATION_CATALOG.filter((item) => item.scope === "client"),
    []
  );
  const connectableClientIntegrations = useMemo(
    () => clientIntegrations.filter((item) => !item.comingSoon),
    [clientIntegrations]
  );

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const agencyConnectedCount = useMemo(() => {
    return agencyIntegrations.reduce((acc, item) => {
      const record = integrationsByKey.get(
        buildIntegrationKey(item.provider, item.ownerKey)
      );
      return acc + (isConnectedStatus(record?.status) ? 1 : 0);
    }, 0);
  }, [agencyIntegrations, integrationsByKey]);

  const clientConnectedCount = useMemo(() => {
    if (!selectedClientId) return 0;
    return connectableClientIntegrations.reduce((acc, item) => {
      const matches = (integrations || []).filter(
        (integration) =>
          integration.ownerType === "CLIENT" &&
          integration.clientId === selectedClientId &&
          integration.provider === item.provider &&
          (!item.kind || integration.settings?.kind === item.kind)
      );
      return acc + (matches.some((entry) => isConnectedStatus(entry.status)) ? 1 : 0);
    }, 0);
  }, [connectableClientIntegrations, integrations, selectedClientId]);

  const activeDefinition = useMemo(() => {
    return INTEGRATION_CATALOG.find((item) => item.key === activeKey) || null;
  }, [activeKey]);

  const activeIntegration = useMemo(() => {
    if (!activeDefinition) return null;
    return (
      integrationsByKey.get(
        buildIntegrationKey(activeDefinition.provider, activeDefinition.ownerKey)
      ) || null
    );
  }, [activeDefinition, integrationsByKey]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const metaStatus = params.get("meta");
    if (params.get("whatsapp") === "connected" || metaStatus === "connected") {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    }

    if (metaStatus === "connected") {
      const kind = params.get("kind");
      const clientId = params.get("clientId");
      setActiveKey(resolveMetaKey(kind));
      setInitialClientId(clientId || "");
    }
  }, [location.search, queryClient]);

  useEffect(() => {
    if (activeClientId === selectedClientId) return;
    setSelectedClientId(activeClientId || "");
  }, [activeClientId, selectedClientId]);

  useEffect(() => {
    if (selectedClientId) return;
    if (clients.length === 1) {
      setSelectedClientId(clients[0].id);
      setActiveClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
      setActiveClientId(initialClientId);
    }
  }, [initialClientId]);

  const metaBanner = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    const metaStatus = params.get("meta");
    if (!metaStatus) return null;
    if (metaStatus === "connected") {
      return {
        tone: "success",
        title: "Meta conectado com sucesso.",
        detail: "Selecione a conta principal antes de seguir.",
      };
    }
    if (metaStatus === "error") {
      return {
        tone: "error",
        title: "Não foi possível conectar a Meta.",
        detail: "Revise as permissões do app e tente novamente.",
      };
    }
    return null;
  }, [location.search]);

  return (
    <PageShell>
      <PageHeader
        title="Integracoes"
        subtitle="Conecte canais essenciais da agencia e mantenha tudo sincronizado."
        actions={
          <Button
            variant="secondary"
            size="lg"
            leftIcon={RefreshCw}
            onClick={() => refetch()}
            disabled={isFetching}
            isLoading={isFetching}
          >
            Atualizar conexoes
          </Button>
        }
      />

      <div className="mt-4 text-xs text-[var(--text-muted)]">
        {connectedCount} de {connectableCatalog.length} integracoes ativas.
      </div>

      <div className="mt-8 space-y-12">
        {metaBanner ? (
          <div
            className={`rounded-[12px] border px-4 py-3 text-sm ${
              metaBanner.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            <p className="font-semibold">{metaBanner.title}</p>
            <p className="text-xs mt-1">{metaBanner.detail}</p>
          </div>
        ) : null}

        <section className="rounded-[24px] bg-white px-6 py-8 md:px-10 md:py-10 shadow-[var(--shadow-sm)] border border-[var(--border)]">
          <div className="flex flex-col gap-2 mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Conexões da agência
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-slate-900">
              WhatsApp da agência
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              O WhatsApp é único para a agência e será usado para aprovações dos clientes.
            </p>
            <p className="text-xs text-slate-500">
              {agencyConnectedCount} de {agencyIntegrations.length} integrações conectadas.
            </p>
          </div>

          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {[1].map((item) => (
                <div
                  key={item}
                  className="h-56 rounded-2xl bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {agencyIntegrations.map((integration) => {
                const record =
                  integration.scope === "client"
                    ? null
                    : integrationsByKey.get(
                        buildIntegrationKey(integration.provider, integration.ownerKey)
                      );
                const tileStatus =
                  integration.scope === "client" ? "disconnected" : record?.status;
                const Icon = integration.icon;
                return (
                  <IntegrationTile
                    key={integration.key}
                    title={integration.title}
                    subtitle={integration.subtitle}
                    description={integration.description}
                    status={tileStatus}
                    accentClass={integration.accentClass}
                    icon={<Icon className="w-5 h-5 text-white" />}
                    actionLabel={
                      isConnectedStatus(tileStatus) ? "Gerenciar conexão" : "Conectar"
                    }
                    onConnect={() => {
                      if (integration.key === "google-analytics") {
                        navigate("/integrations/ga4");
                        return;
                      }
                      setActiveKey(integration.key);
                      setInitialClientId("");
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[24px] bg-white px-6 py-8 md:px-10 md:py-10 shadow-[var(--shadow-sm)] border border-[var(--border)]">
          <div className="flex flex-col gap-4 mb-8">
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Conexões do cliente
              </p>
              <h2 className="text-2xl md:text-3xl font-semibold text-slate-900">
                Redes sociais por cliente
              </h2>
              <p className="text-sm text-slate-600 max-w-2xl">
                Cada cliente precisa de suas próprias redes conectadas para posts e métricas.
              </p>
              <p className="text-xs text-slate-500">
                {selectedClientId
                  ? `${clientConnectedCount} de ${connectableClientIntegrations.length} integrações conectadas`
                  : `Selecione um cliente para ver as integrações`}
              </p>
            </div>

            <div className="flex flex-col gap-2 max-w-md">
              <label className="text-xs font-semibold text-[var(--text-muted)]">
                Cliente selecionado
              </label>
              <SelectNative
                value={selectedClientId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedClientId(value);
                  setActiveClientId(value);
                }}
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </SelectNative>
              {clients.length === 0 ? (
                <p className="text-[11px] text-amber-600">
                  Cadastre um cliente antes de conectar redes sociais.
                </p>
              ) : null}
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-56 rounded-2xl bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {clientIntegrations.map((integration) => {
                const clientMatches = (integrations || []).filter(
                  (entry) =>
                    entry.ownerType === "CLIENT" &&
                    entry.clientId === selectedClientId &&
                    entry.provider === integration.provider &&
                    (!integration.kind || entry.settings?.kind === integration.kind)
                );
                const connectedClients = clientMatches.filter((entry) =>
                  isConnectedStatus(entry.status)
                );
                const isSoon = Boolean(integration.comingSoon);
                const tileStatus = isSoon
                  ? "soon"
                  : connectedClients.length
                  ? "connected"
                  : "disconnected";
                const tileMeta =
                  selectedClient?.name && selectedClientId
                    ? `Cliente: ${selectedClient.name}`
                    : isSoon
                    ? "Disponivel em breve"
                    : "Selecione um cliente para conectar";
                const Icon = integration.icon;
                return (
                  <IntegrationTile
                    key={integration.key}
                    title={integration.title}
                    subtitle={integration.subtitle}
                    description={integration.description}
                    status={tileStatus}
                    accentClass={integration.accentClass}
                    icon={<Icon className="w-5 h-5 text-white" />}
                    meta={tileMeta}
                    actionLabel={
                      integration.key === "google-analytics"
                        ? "Abrir GA4"
                        : isSoon
                        ? "Saiba mais"
                        : isConnectedStatus(tileStatus)
                        ? "Gerenciar conexão"
                        : "Conectar"
                    }
                    disabled={!selectedClientId && !isSoon}
                    onConnect={() => {
                      if (integration.key === "google-analytics") {
                        navigate("/integrations/ga4");
                        return;
                      }
                      if (isSoon) {
                        setComingSoonDefinition(integration);
                        return;
                      }
                      if (!selectedClientId) return;
                      setActiveKey(integration.key);
                      setInitialClientId(selectedClientId);
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>

        <IntegrationConnectDialog
          open={Boolean(activeDefinition)}
          onOpenChange={(openState) => {
            if (!openState) {
              setActiveKey(null);
              setInitialClientId("");
            }
          }}
          definition={activeDefinition}
          existing={activeIntegration}
          integrations={integrations}
          clients={clients}
          initialClientId={initialClientId}
        />

        <Dialog
          open={Boolean(comingSoonDefinition)}
          onOpenChange={(openState) => {
            if (!openState) setComingSoonDefinition(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{comingSoonDefinition?.title || "Integracao"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <p>
                Esta integracao esta em desenvolvimento. Avisaremos quando estiver
                disponivel para conexao.
              </p>
              <Button type="button" onClick={() => setComingSoonDefinition(null)}>
                Entendi
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageShell>
  );
}
