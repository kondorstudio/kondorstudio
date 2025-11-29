import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "../apiClient/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, PlugZap2, Trash2 } from "lucide-react";

const PROVIDER_OPTIONS = [
  { value: "META", label: "Meta Ads (Facebook/Instagram)" },
  { value: "GOOGLE", label: "Google Ads" },
  { value: "TIKTOK", label: "TikTok Ads" },
  { value: "WHATSAPP_360DIALOG", label: "WhatsApp (360dialog)" },
  { value: "TWILIO", label: "Twilio (WhatsApp/SMS)" },
];

function formatProviderLabel(value) {
  const found = PROVIDER_OPTIONS.find((p) => p.value === value);
  return found ? found.label : value;
}

function formatDate(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Integrations() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [configText, setConfigText] = useState("");

  const { data: integrations = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => base44.entities.Integration.list(),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProvider) throw new Error("Selecione um provedor");

      const payload = {
        provider: selectedProvider,
        // status simbólico; backend salva como String
        status: "connected",
        // por enquanto, tratamos config como texto simples (JSON ou não)
        config: configText ? { raw: configText } : null,
      };

      return base44.entities.Integration.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setDialogOpen(false);
      setSelectedProvider("");
      setConfigText("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Integration.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  const handleOpenDialog = () => {
    setSelectedProvider("");
    setConfigText("");
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Desconectar essa integração?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Integrações
            </h1>
            <p className="text-gray-600">
              Conecte suas contas de anúncios e canais para puxar métricas automaticamente.
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
            <Button
              onClick={handleOpenDialog}
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 flex items-center gap-2"
            >
              <PlugZap2 className="w-4 h-4" />
              Nova integração
            </Button>
          </div>
        </div>

        {/* Lista de integrações */}
        <Card className="border border-purple-100">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-800">
              Conexões ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 bg-gray-100 animate-pulse rounded-lg"
                  />
                ))}
              </div>
            ) : integrations.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhuma integração configurada ainda. Clique em &quot;Nova integração&quot; para começar.
              </p>
            ) : (
              <div className="space-y-3">
                {integrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2 bg-white"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {formatProviderLabel(integration.provider)}
                        </span>
                        {integration.status && (
                          <Badge
                            variant="outline"
                            className={
                              integration.status === "connected"
                                ? "border-emerald-200 text-emerald-700"
                                : "border-amber-200 text-amber-700"
                            }
                          >
                            {integration.status}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
                        <span>
                          Último sync:{" "}
                          <span className="font-medium">
                            {formatDate(integration.lastSyncAt)}
                          </span>
                        </span>
                        {integration.errorMessage && (
                          <span className="text-red-500">
                            Erro: {integration.errorMessage}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(integration.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog de nova integração */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova integração</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label>Provedor</Label>
                <Select
                  value={selectedProvider}
                  onValueChange={setSelectedProvider}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Configuração (opcional)
                </Label>
                <Textarea
                  rows={4}
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  placeholder='Tokens, IDs de conta, etc. Você pode colar JSON ou notas livres por enquanto.'
                />
                <p className="text-[11px] text-gray-500">
                  Nesta versão, os dados são salvos como JSON bruto em
                  <code className="px-1 rounded bg-gray-100 ml-1">config</code>.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700"
                  disabled={createMutation.isPending || !selectedProvider}
                >
                  {createMutation.isPending
                    ? "Conectando..."
                    : "Conectar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
