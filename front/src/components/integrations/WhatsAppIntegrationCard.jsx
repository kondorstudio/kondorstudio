import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import IntegrationCard from "./IntegrationCard.jsx";
import { MessageCircle } from "lucide-react";

function safeDate(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function WhatsAppIntegrationCard({ integrations }) {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const waIntegration = useMemo(() => {
    return integrations.find((i) => i.provider === "WHATSAPP_META_CLOUD");
  }, [integrations]);

  const statusRaw = waIntegration?.status || "DISCONNECTED";
  const statusNorm = String(statusRaw || "DISCONNECTED").toLowerCase();
  const isConnected = statusNorm === "connected";
  const cfg = waIntegration?.config || {};
  const displayPhone =
    cfg.display_phone_number ||
    cfg.display_phone ||
    cfg.displayPhone ||
    cfg.phone ||
    cfg.whatsappE164 ||
    "-";
  const lastWebhookAt = cfg.last_webhook_at || cfg.lastWebhookAt || null;

  const connectMutation = useMutation({
    mutationFn: async () => {
      // endpoint novo que vamos criar no backend
      const data = await base44.jsonFetch("/integrations/whatsapp/connect-url", { method: "GET" });
      if (!data?.url) throw new Error("Resposta inválida do servidor (faltou url).");
      return data.url;
    },
    onSuccess: async (url) => {
      // pode ser popup ou redirect. Redirect é mais simples e confiável.
      window.location.href = url;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      // endpoint novo (melhor do que remover a Integration direto)
      return base44.jsonFetch("/integrations/whatsapp/disconnect", { method: "POST" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      return base44.jsonFetch("/integrations/whatsapp/test", { method: "POST" });
    },
  });

  const metaLines = [
    `Número: ${displayPhone}`,
    `Último evento (webhook): ${lastWebhookAt ? safeDate(lastWebhookAt) : "-"}`,
  ];

  const handleConnect = async () => {
    try {
      setConnecting(true);
      await connectMutation.mutateAsync();
    } catch (e) {
      alert(e?.message || "Falha ao iniciar conexão do WhatsApp.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Desconectar o WhatsApp? Isso desativa envio automático e webhooks.")) return;
    try {
      await disconnectMutation.mutateAsync();
    } catch (e) {
      alert(e?.message || "Falha ao desconectar.");
    }
  };

  const handleTest = async () => {
    try {
      await testMutation.mutateAsync();
      alert("Teste disparado. Verifique seu WhatsApp / logs.");
    } catch (e) {
      alert(e?.message || "Falha ao testar.");
    }
  };

  return (
    <IntegrationCard
      title="WhatsApp (Cloud API Oficial)"
      description="Envio automático de aprovações + captura de respostas (APROVAR/AJUSTES/REPROVAR)."
      status={statusNorm}
      metaLines={metaLines}
      rightIcon={<MessageCircle className="w-5 h-5 text-purple-600" />}
      primaryAction={
        isConnected
          ? null
          : {
              label: connecting ? "Conectando..." : "Conectar WhatsApp",
              onClick: handleConnect,
              disabled: connecting || connectMutation.isPending,
              className:
                "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700",
            }
      }
      secondaryAction={
        isConnected
          ? {
              label: testMutation.isPending ? "Testando..." : "Testar conexão",
              onClick: handleTest,
              disabled: testMutation.isPending,
            }
          : {
              label: "Como funciona",
              onClick: () =>
                alert(
                  "Você fará login na Meta e selecionará o número do WhatsApp Business. A Kondor cuidará do envio e dos webhooks automaticamente."
                ),
              disabled: false,
            }
      }
      dangerAction={
        isConnected
          ? {
              label: disconnectMutation.isPending ? "Desconectando..." : "Desconectar",
              onClick: handleDisconnect,
              disabled: disconnectMutation.isPending,
              title: "Desconectar WhatsApp",
            }
          : null
      }
      footerHint={
        isConnected
          ? "Conectado: você pode enviar solicitações e receber respostas automaticamente."
          : "Desconectado: você ainda pode usar envio manual via link wa.me (fallback)."
      }
    />
  );
}
