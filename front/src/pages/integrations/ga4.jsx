import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

function useQueryParams() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

function buildScopeNotice(payload = {}, fallbackScope) {
  const scopeApplied = payload?.scopeApplied || fallbackScope || "LEGACY_INTEGRATION_ONLY";
  const affectedTotal = Number(payload?.affectedBrandsTotal || 0);
  const affectedSucceeded = Number(payload?.affectedBrandsSucceeded || 0);
  const affectedFailed = Number(payload?.affectedBrandsFailed || 0);
  const syncQueued = Number(payload?.syncQueuedTotal || 0);
  const syncSkipped = Number(payload?.syncSkippedTotal || 0);

  if (scopeApplied === "SINGLE_BRAND") {
    return `Propriedade aplicada na marca. Sync enfileirado: ${syncQueued}.`;
  }

  if (scopeApplied === "ALL_BRANDS") {
    return `Propriedade aplicada em ${affectedSucceeded}/${affectedTotal} marcas. Falhas: ${affectedFailed}. Sync enfileirado: ${syncQueued}, pulado: ${syncSkipped}.`;
  }

  return "Propriedade da integração atualizada.";
}

export default function Ga4IntegrationPage() {
  const queryClient = useQueryClient();
  const queryParams = useQueryParams();

  const clientIdParam = queryParams.get("clientId") || "";
  const brandIdParam = queryParams.get("brandId") || "";
  const scopedBrandId = brandIdParam || clientIdParam || "";
  const selectedApplyMode = scopedBrandId ? "SINGLE_BRAND" : "ALL_BRANDS";

  const [draftSelectedPropertyId, setDraftSelectedPropertyId] = useState("");
  const [connectError, setConnectError] = useState("");
  const [disconnectError, setDisconnectError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [reauthNotice, setReauthNotice] = useState("");
  const [demoData, setDemoData] = useState(null);
  const [demoError, setDemoError] = useState("");
  const [brandBindingError, setBrandBindingError] = useState("");
  const [brandBindingNotice, setBrandBindingNotice] = useState("");
  const lastServerSelectedPropertyRef = useRef("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["ga4-status"],
    queryFn: () => base44.ga4.status(),
  });

  const status = data?.status || "DISCONNECTED";
  const legacyStatus = data?.legacyStatus || status;
  const properties = data?.properties || [];
  const selectedProperty = data?.selectedProperty || null;
  const serverSelectedPropertyId = selectedProperty?.propertyId
    ? String(selectedProperty.propertyId)
    : "";

  const needsReconnect =
    status === "REAUTH_REQUIRED" ||
    status === "NEEDS_RECONNECT" ||
    legacyStatus === "NEEDS_RECONNECT";

  const googleEmail = data?.googleAccountEmail || null;

  const { data: brandSettingsData, error: brandSettingsError } = useQuery({
    queryKey: ["ga4-brand-settings", scopedBrandId],
    queryFn: () => base44.ga4.getBrandSettings({ brandId: scopedBrandId }),
    enabled: Boolean(scopedBrandId && status === "CONNECTED"),
    retry: false,
  });

  const brandActivePropertyId = brandSettingsData?.settings?.propertyId
    ? String(brandSettingsData.settings.propertyId)
    : "";

  useEffect(() => {
    if (serverSelectedPropertyId === lastServerSelectedPropertyRef.current) {
      return;
    }

    lastServerSelectedPropertyRef.current = serverSelectedPropertyId;
    if (!serverSelectedPropertyId) return;

    const existsInList = properties.some(
      (item) => String(item?.propertyId || "") === serverSelectedPropertyId,
    );

    if (existsInList) {
      setDraftSelectedPropertyId(serverSelectedPropertyId);
    }
  }, [properties, serverSelectedPropertyId]);

  useEffect(() => {
    if (!properties.length) {
      if (draftSelectedPropertyId) setDraftSelectedPropertyId("");
      return;
    }

    const propertyIds = new Set(
      properties.map((item) => String(item?.propertyId || "")).filter(Boolean),
    );

    if (draftSelectedPropertyId && propertyIds.has(draftSelectedPropertyId)) {
      return;
    }

    if (serverSelectedPropertyId && propertyIds.has(serverSelectedPropertyId)) {
      setDraftSelectedPropertyId(serverSelectedPropertyId);
      return;
    }

    setDraftSelectedPropertyId(String(properties[0]?.propertyId || ""));
  }, [properties, draftSelectedPropertyId, serverSelectedPropertyId]);

  const oauthContext = useMemo(
    () => ({
      ...(clientIdParam ? { clientId: clientIdParam } : {}),
      ...(brandIdParam ? { brandId: brandIdParam } : {}),
    }),
    [brandIdParam, clientIdParam],
  );

  const connectMutation = useMutation({
    mutationFn: (options) => base44.ga4.oauthStart(options),
    onSuccess: (payload) => {
      setConnectError("");
      if (payload?.url) {
        window.location.href = payload.url;
      }
    },
    onError: (err) => {
      const message =
        err?.data?.error ||
        err?.message ||
        "Falha ao iniciar conexao com GA4.";
      setConnectError(message);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => base44.ga4.syncProperties(),
    onSuccess: () => {
      setSyncError("");
      queryClient.invalidateQueries({ queryKey: ["ga4-status"] });
    },
    onError: (err) => {
      const message =
        err?.data?.error ||
        err?.message ||
        "Falha ao sincronizar propriedades.";
      setSyncError(message);
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (propertyId) =>
      base44.ga4.selectProperty({
        propertyId,
        applyMode: selectedApplyMode,
        ...(scopedBrandId ? { brandId: scopedBrandId } : {}),
        syncAfterSelect: true,
        includeCampaigns: false,
        syncDays: 30,
      }),
    onSuccess: (payload) => {
      setBrandBindingError("");
      setBrandBindingNotice(buildScopeNotice(payload || {}, selectedApplyMode));
      queryClient.invalidateQueries({ queryKey: ["ga4-status"] });
      if (scopedBrandId) {
        queryClient.invalidateQueries({
          queryKey: ["ga4-brand-settings", scopedBrandId],
        });
      }
    },
    onError: (err) => {
      const message =
        err?.data?.error ||
        err?.message ||
        "Falha ao selecionar propriedade.";
      setBrandBindingError(message);
      setBrandBindingNotice("");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => base44.ga4.disconnect(),
    onSuccess: () => {
      setDisconnectError("");
      queryClient.invalidateQueries({ queryKey: ["ga4-status"] });
      if (scopedBrandId) {
        queryClient.invalidateQueries({
          queryKey: ["ga4-brand-settings", scopedBrandId],
        });
      }
    },
    onError: (err) => {
      const message =
        err?.data?.error ||
        err?.message ||
        "Falha ao desconectar GA4.";
      setDisconnectError(message);
    },
  });

  const connectedParam = queryParams.get("connected");
  const errorParam = queryParams.get("error");
  const messageParam = queryParams.get("message");

  useEffect(() => {
    if (connectedParam === "1") {
      queryClient.invalidateQueries({ queryKey: ["ga4-status"] });
      if (scopedBrandId) {
        queryClient.invalidateQueries({
          queryKey: ["ga4-brand-settings", scopedBrandId],
        });
      }
    }
  }, [connectedParam, queryClient, scopedBrandId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleReauth = () => {
      setReauthNotice(
        "Sua conexão com o GA4 expirou ou foi revogada. Reconecte para continuar.",
      );
      queryClient.invalidateQueries({ queryKey: ["ga4-status"] });
    };
    window.addEventListener("ga4_reauth_required", handleReauth);
    return () => window.removeEventListener("ga4_reauth_required", handleReauth);
  }, [queryClient]);

  const demoMutation = useMutation({
    mutationFn: () =>
      base44.ga4.demoReport(
        draftSelectedPropertyId ? { propertyId: draftSelectedPropertyId } : {},
      ),
    onSuccess: (payload) => {
      setDemoError("");
      setDemoData(payload || null);
    },
    onError: (err) => {
      const message =
        err?.data?.error ||
        err?.message ||
        "Falha ao carregar demo report.";
      setDemoError(message);
    },
  });

  const connectionBanner = useMemo(() => {
    if (connectedParam === "1") {
      return { tone: "success", text: "GA4 conectado com sucesso." };
    }
    if (connectedParam === "0") {
      return {
        tone: "error",
        text: messageParam || "Falha ao conectar GA4.",
      };
    }
    return null;
  }, [connectedParam, messageParam]);

  useEffect(() => {
    setDemoData(null);
    setDemoError("");
  }, [draftSelectedPropertyId, status]);

  useEffect(() => {
    if (status === "CONNECTED") {
      setReauthNotice("");
    }
    if (
      status === "REAUTH_REQUIRED" ||
      status === "NEEDS_RECONNECT" ||
      legacyStatus === "NEEDS_RECONNECT"
    ) {
      setReauthNotice(
        "Sua conexão com o GA4 expirou ou foi revogada. Reconecte para continuar.",
      );
    }
  }, [status, legacyStatus]);

  const demoRows = demoData?.rows || [];

  return (
    <PageShell>
      <PageHeader
        title="Google Analytics 4"
        subtitle="Conecte sua conta Google e selecione uma propriedade GA4."
      />

      {connectionBanner ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            connectionBanner.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {connectionBanner.text}
          {errorParam ? ` (${errorParam})` : ""}
        </div>
      ) : null}
      {reauthNotice ? (
        <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
          {reauthNotice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Conexao GA4</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Carregando status...</p>
            ) : error ? (
              <p className="text-sm text-rose-600">Falha ao carregar status.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--text-muted)]">Status</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-[var(--text)]">{status}</p>
                      {needsReconnect ? (
                        <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          Reconectar
                        </span>
                      ) : null}
                    </div>
                    {googleEmail ? (
                      <p className="text-xs text-[var(--text-muted)]">{googleEmail}</p>
                    ) : null}
                    {selectedProperty ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        Propriedade da integração: {selectedProperty.displayName} ({selectedProperty.propertyId})
                      </p>
                    ) : null}
                    {scopedBrandId ? (
                      <p className="text-xs text-[var(--text-muted)]">Marca no contexto: {scopedBrandId}</p>
                    ) : null}
                    {brandActivePropertyId ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        Propriedade ativa da marca: {brandActivePropertyId}
                      </p>
                    ) : null}
                    {brandSettingsError ? (
                      <p className="text-xs text-amber-700">
                        Nao foi possivel carregar a propriedade ativa da marca.
                      </p>
                    ) : null}
                    {data?.lastError ? (
                      <p className="text-xs text-rose-600">{data.lastError}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {status === "CONNECTED" && !needsReconnect ? (
                      <Button
                        variant="outline"
                        onClick={() => disconnectMutation.mutate()}
                        disabled={disconnectMutation.isPending}
                      >
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          setConnectError("");
                          connectMutation.mutate({ force: true, ...oauthContext });
                        }}
                        disabled={connectMutation.isPending}
                      >
                        {needsReconnect ? "Reconectar GA4" : "Conectar GA4"}
                      </Button>
                    )}
                  </div>
                </div>
                {connectError ? <p className="text-xs text-rose-600">{connectError}</p> : null}
                {disconnectError ? (
                  <p className="text-xs text-rose-600">{disconnectError}</p>
                ) : null}
                <p className="text-xs text-[var(--text-muted)]">
                  Apenas leitura via API. Nenhum script do GA4 sera instalado no front.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Propriedades GA4</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {status !== "CONNECTED" ? (
              <p className="text-sm text-[var(--text-muted)]">
                Conecte a conta Google para listar propriedades.
              </p>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  Sincronizar propriedades
                </Button>
                {syncError ? <p className="text-xs text-rose-600">{syncError}</p> : null}
                {brandBindingError ? (
                  <p className="text-xs text-rose-600">{brandBindingError}</p>
                ) : null}
                {brandBindingNotice ? (
                  <p className="text-xs text-emerald-700">{brandBindingNotice}</p>
                ) : null}

                <p className="text-xs text-[var(--text-muted)]">
                  Escopo ao salvar: {scopedBrandId ? "esta marca" : "todas as marcas do tenant"}.
                </p>
                {scopedBrandId ? (
                  <p className="text-xs text-[var(--text-muted)]">Marca alvo: {scopedBrandId}</p>
                ) : null}

                {brandActivePropertyId &&
                serverSelectedPropertyId &&
                brandActivePropertyId !== serverSelectedPropertyId ? (
                  <p className="text-xs text-amber-700">
                    A propriedade ativa da marca difere da selecionada na integração. Salve a seleção para reconciliar.
                  </p>
                ) : null}

                {properties.length ? (
                  <div className="flex flex-col gap-3">
                    <SelectNative
                      value={draftSelectedPropertyId}
                      onChange={(event) => setDraftSelectedPropertyId(event.target.value)}
                    >
                      {properties.map((prop) => (
                        <option key={prop.id} value={prop.propertyId}>
                          {prop.displayName} ({prop.propertyId})
                        </option>
                      ))}
                    </SelectNative>
                    {!selectedProperty ? (
                      <p className="text-xs text-purple-600">
                        Nenhuma propriedade selecionada. Selecione uma para habilitar relatórios e dashboards.
                      </p>
                    ) : null}
                    <Button
                      onClick={() => selectMutation.mutate(draftSelectedPropertyId)}
                      disabled={!draftSelectedPropertyId || selectMutation.isPending}
                    >
                      Selecionar propriedade
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Nenhuma propriedade encontrada ainda.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Demo GA4 (sessions + activeUsers)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {status !== "CONNECTED" ? (
              <p className="text-sm text-[var(--text-muted)]">
                Conecte o GA4 para gerar o demo report.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => demoMutation.mutate()}
                    disabled={demoMutation.isPending}
                  >
                    {demoMutation.isPending
                      ? "Gerando..."
                      : "Gerar Dashboard Demo"}
                  </Button>
                  <span className="text-xs text-[var(--text-muted)]">Ultimos 7 dias</span>
                </div>
                {demoError ? <p className="text-xs text-rose-600">{demoError}</p> : null}
                {demoRows.length ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={demoRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="sessions"
                          stroke="#2563eb"
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="activeUsers"
                          stroke="#16a34a"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Clique em &quot;Gerar Dashboard Demo&quot; para ver os dados.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
