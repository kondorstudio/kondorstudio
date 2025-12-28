import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { base44 } from "../apiClient/base44Client";

import { Button } from "@/components/ui/button.jsx";
import {
  RefreshCw,
  Briefcase,
  Megaphone,
  BarChart3,
  MessageCircle,
  Music,
  Camera,
} from "lucide-react";

import IntegrationTile from "@/components/integrations/IntegrationTile.jsx";
import IntegrationConnectDialog from "@/components/integrations/IntegrationConnectDialog.jsx";

const DEFAULT_OWNER_KEY = "AGENCY";

const INTEGRATION_CATALOG = [
  {
    key: "meta-business",
    title: "Meta Business",
    subtitle: "Publicações orgânicas",
    description: "Conecte páginas e contas para publicar posts automaticamente.",
    provider: "META",
    ownerKey: "META_BUSINESS",
    kind: "meta_business",
    scope: "client",
    accentClass: "from-blue-500 to-indigo-500",
    icon: Briefcase,
    dialogDescription:
      "Informe os dados da conta Meta Business que será usada para publicar.",
    oauth: {
      title: "Conexão oficial via Meta",
      subtitle: "Recomendado para páginas e Instagram Business.",
      label: "Conectar via Meta",
      endpoint: "/integrations/meta/connect-url",
    },
    fields: [
      {
        name: "pageId",
        label: "ID da Página do Facebook",
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
        helper: "Permissões: pages_manage_posts, instagram_content_publish.",
      },
    ],
  },
  {
    key: "meta-ads",
    title: "Meta Ads",
    subtitle: "Métricas e relatórios",
    description: "Importe resultados de campanhas para dashboards e relatórios.",
    provider: "META",
    ownerKey: "META_ADS",
    kind: "meta_ads",
    scope: "client",
    accentClass: "from-sky-500 to-cyan-500",
    icon: Megaphone,
    dialogDescription:
      "Configure a conta de anúncios usada para coletar métricas.",
    oauth: {
      title: "Conexão oficial via Meta Ads",
      subtitle: "Recomendado para acesso contínuo às campanhas.",
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
        label: "Métricas (opcional)",
        placeholder: "impressions,clicks,spend",
        required: false,
      },
    ],
  },
  {
    key: "google-analytics",
    title: "Google Analytics",
    subtitle: "GA4 + relatórios",
    description: "Extraia métricas do site e exporte relatórios automatizados.",
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
    key: "whatsapp-business",
    title: "WhatsApp Business",
    subtitle: "Aprovações via WhatsApp",
    description: "Envio automático de aprovações e respostas do cliente.",
    provider: "WHATSAPP_META_CLOUD",
    ownerKey: "AGENCY",
    kind: "whatsapp_business",
    scope: "agency",
    accentClass: "from-emerald-500 to-lime-500",
    icon: MessageCircle,
    dialogDescription:
      "Preencha os dados do WhatsApp Business Cloud API para envio.",
    oauth: {
      title: "Conexão oficial via Meta",
      subtitle: "Recomendado para webhooks e envio automático.",
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
  {
    key: "tiktok",
    title: "TikTok",
    subtitle: "Publicações automáticas",
    description: "Publique vídeos e acompanhe a agenda do cliente.",
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
    key: "instagram",
    title: "Instagram",
    subtitle: "Somente Instagram",
    description: "Ideal quando o cliente quer postar apenas no Instagram.",
    provider: "META",
    ownerKey: "INSTAGRAM",
    kind: "instagram_only",
    scope: "client",
    accentClass: "from-pink-500 to-orange-500",
    icon: Camera,
    dialogDescription:
      "Conecte uma conta Instagram Business para publicar.",
    oauth: {
      title: "Conexão oficial via Meta",
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
        label: "ID da Página do Facebook (opcional)",
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
];

function buildIntegrationKey(provider, ownerKey) {
  return `${provider}:${ownerKey || DEFAULT_OWNER_KEY}`;
}

function isConnectedStatus(status) {
  const value = String(status || "").toLowerCase();
  return value === "connected" || value === "active";
}

export default function Integrations() {
  const [activeKey, setActiveKey] = useState(null);
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

  const connectedCount = useMemo(() => {
    return INTEGRATION_CATALOG.reduce((acc, item) => {
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
  }, [integrations, integrationsByKey]);

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
    if (params.get("whatsapp") === "connected" || params.get("meta") === "connected") {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    }
  }, [location.search, queryClient]);

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Integrações</h1>
            <p className="text-gray-600">
              Conecte os canais essenciais da agência e mantenha todo o fluxo automatizado.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {connectedCount} de {INTEGRATION_CATALOG.length} integrações conectadas.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <section className="rounded-3xl bg-white px-6 py-8 md:px-10 md:py-10 shadow-sm shadow-slate-200/70 border border-slate-200/70">
          <div className="flex flex-col gap-2 mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Conexões da agência
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-slate-900">
              Adicionar produtos ao seu aplicativo
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              Selecione a integração desejada para posts, métricas e aprovações. Cada conexão fica
              vinculada à sua agência e pode ser refinada depois.
            </p>
          </div>

          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div
                  key={item}
                  className="h-56 rounded-2xl bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {INTEGRATION_CATALOG.map((integration) => {
                const record =
                  integration.scope === "client"
                    ? null
                    : integrationsByKey.get(
                        buildIntegrationKey(integration.provider, integration.ownerKey)
                      );
                const clientMatches =
                  integration.scope === "client"
                    ? (integrations || []).filter(
                        (entry) =>
                          entry.ownerType === "CLIENT" &&
                          entry.provider === integration.provider &&
                          (!integration.kind || entry.settings?.kind === integration.kind)
                      )
                    : [];
                const connectedClients = clientMatches.filter((entry) =>
                  isConnectedStatus(entry.status)
                );
                const tileStatus =
                  integration.scope === "client"
                    ? connectedClients.length
                      ? "connected"
                      : "disconnected"
                    : record?.status;
                const tileMeta =
                  integration.scope === "client"
                    ? connectedClients.length
                      ? `${connectedClients.length} cliente(s) conectado(s)`
                      : "Nenhum cliente conectado"
                    : null;
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
                      isConnectedStatus(tileStatus) ? "Gerenciar conexão" : "Conectar"
                    }
                    onConnect={() => setActiveKey(integration.key)}
                  />
                );
              })}
            </div>
          )}
        </section>

        <IntegrationConnectDialog
          open={Boolean(activeDefinition)}
          onOpenChange={(openState) => {
            if (!openState) setActiveKey(null);
          }}
          definition={activeDefinition}
          existing={activeIntegration}
          integrations={integrations}
          clients={clients}
        />
      </div>
    </div>
  );
}
