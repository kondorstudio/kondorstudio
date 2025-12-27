import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { base44 } from "@/apiClient/base44Client";
import { Video } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media.js";

export default function Postformdialog({
  open,
  onClose,
  post,
  clients = [],
  integrations = [],
  onSubmit,
  isSaving,
  onDelete,
  isDeleting,
}) {
  const [formData, setFormData] = useState({
    title: "",
    body: "",
    clientId: "",
    status: "DRAFT",
    media_url: "",
    media_type: "image",
    integrationId: "",
  });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const resetState = () => {
    const payload = post
      ? {
          title: post.title || "",
          body: post.body || post.caption || "",
          clientId: post.clientId || "",
          status: post.status || "DRAFT",
          media_url: post.media_url || post.mediaUrl || "",
          media_type: post.media_type || post.mediaType || "image",
          integrationId:
            post.integrationId ||
            post.integration_id ||
            post.metadata?.integrationId ||
            post.metadata?.integration_id ||
            "",
        }
      : {
          title: "",
          body: "",
          clientId: "",
          status: "DRAFT",
          media_url: "",
          media_type: "image",
          integrationId: "",
        };

    setFormData(payload);
    setFile(null);
    const initialMedia = payload.media_url
      ? resolveMediaUrl(payload.media_url)
      : null;
    setPreviewUrl(initialMedia);
  };

  useEffect(() => {
    if (!open) return;
    resetState();
  }, [post, open]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleChange = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const clientIntegrations = React.useMemo(() => {
    if (!formData.clientId) return [];
    return (integrations || []).filter(
      (integration) =>
        integration.ownerType === "CLIENT" &&
        integration.clientId === formData.clientId
    );
  }, [integrations, formData.clientId]);

  const postingIntegrations = React.useMemo(() => {
    return clientIntegrations.filter((integration) => {
      const kind = integration.settings?.kind || "";
      if (kind === "meta_business" || kind === "instagram_only" || kind === "tiktok") {
        return true;
      }
      if (integration.provider === "TIKTOK") return true;
      return false;
    });
  }, [clientIntegrations]);

  const selectedIntegration = React.useMemo(() => {
    if (!formData.integrationId) return null;
    return postingIntegrations.find((integration) => integration.id === formData.integrationId) || null;
  }, [formData.integrationId, postingIntegrations]);

  const resolveIntegrationLabel = (integration) => {
    if (!integration) return "Selecione uma rede";
    const kind = integration.settings?.kind;
    if (kind === "meta_business") return "Meta Business (Facebook/Instagram)";
    if (kind === "instagram_only") return "Instagram";
    if (kind === "tiktok") return "TikTok";
    return integration.providerName || integration.provider || "Integração";
  };

  const resolvePlatformValue = (integration) => {
    if (!integration) return null;
    const kind = integration.settings?.kind;
    if (kind === "instagram_only") return "instagram";
    if (kind === "tiktok") return "tiktok";
    if (kind === "meta_business") return "meta_business";
    return integration.provider || null;
  };

  useEffect(() => {
    if (!formData.clientId) return;
    if (formData.integrationId) return;
    if (postingIntegrations.length === 1) {
      setFormData((prev) => ({ ...prev, integrationId: postingIntegrations[0].id }));
    }
  }, [formData.clientId, formData.integrationId, postingIntegrations]);

  useEffect(() => {
    if (!formData.integrationId) return;
    if (!integrations.length) return;
    const stillValid = postingIntegrations.some(
      (integration) => integration.id === formData.integrationId
    );
    if (!stillValid) {
      setFormData((prev) => ({ ...prev, integrationId: "" }));
    }
  }, [formData.integrationId, postingIntegrations]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    const objectUrl = URL.createObjectURL(selected);
    setPreviewUrl(objectUrl);

    // 🔥 aqui detectamos automaticamente se é vídeo ou imagem
    const isVideo = selected.type?.startsWith("video/");
    setFormData((prev) => ({
      ...prev,
      media_type: isVideo ? "video" : "image",
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.clientId) {
      alert("Selecione um cliente antes de salvar o post.");
      return;
    }
    if (!formData.title.trim()) {
      alert("Informe um título para o post.");
      return;
    }
    if (!file && !formData.media_url) {
      alert("Envie um arquivo de mídia antes de salvar.");
      return;
    }
    if (postingIntegrations.length > 0 && !formData.integrationId) {
      alert("Selecione a rede social do cliente antes de salvar.");
      return;
    }

    try {
      setIsUploading(true);
      let mediaUrlToSave = formData.media_url || null;

      if (file) {
        const { url } = await base44.uploads.uploadFile(file, {
          folder: "posts",
          isPublic: true, // garante que vídeo/imagem fique público
        });
        mediaUrlToSave = url;
      }

      const payload = {
        ...formData,
        media_url: mediaUrlToSave,
        integrationId: formData.integrationId || null,
        integrationKind: selectedIntegration?.settings?.kind || null,
        integrationProvider: selectedIntegration?.provider || null,
        platform: resolvePlatformValue(selectedIntegration),
      };

      if (onSubmit) {
        await onSubmit(payload);
      }
    } catch (error) {
      console.error("Erro ao salvar post:", error);
      const message =
        error?.data?.error ||
        error?.message ||
        "Erro ao salvar post. Tente novamente.";
      alert(message);
    } finally {
      setIsUploading(false);
    }
  };

  const effectivePreview = previewUrl;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{post ? "Editar Post" : "Novo Post"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Título */}
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={formData.title}
              onChange={handleChange("title")}
              placeholder="Título do post"
              required
            />
          </div>

          {/* Corpo */}
          <div className="space-y-2">
            <Label>Legenda / Corpo</Label>
            <Textarea
              value={formData.body}
              onChange={handleChange("body")}
              placeholder="Texto ou legenda do post"
              rows={4}
            />
          </div>

          {/* Cliente */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            <select
              value={formData.clientId}
              onChange={handleChange("clientId")}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Selecione um cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Rede social */}
          <div className="space-y-2">
            <Label>Rede social do cliente</Label>
            <select
              value={formData.integrationId}
              onChange={handleChange("integrationId")}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={!formData.clientId || postingIntegrations.length === 0}
            >
              <option value="">
                {formData.clientId
                  ? postingIntegrations.length
                    ? "Selecione uma rede"
                    : "Nenhuma integração encontrada"
                  : "Selecione um cliente primeiro"}
              </option>
              {postingIntegrations.map((integration) => (
                <option key={integration.id} value={integration.id}>
                  {resolveIntegrationLabel(integration)}
                </option>
              ))}
            </select>
            {formData.clientId && postingIntegrations.length === 0 ? (
              <p className="text-[11px] text-amber-600">
                Cadastre uma integração deste cliente antes de publicar.
              </p>
            ) : null}
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              value={formData.status}
              onChange={handleChange("status")}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Selecione o status</option>
              <option value="DRAFT">Rascunho</option>
              <option value="PENDING_APPROVAL">Aguardando aprovação</option>
              <option value="APPROVED">Aprovado</option>
              <option value="SCHEDULED">Programado</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="ARCHIVED">Arquivado</option>
            </select>
          </div>

          {/* Upload de mídia */}
          <div className="space-y-2">
            <Label>Mídia</Label>

            {effectivePreview ? (
              <div className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                {formData.media_type === "video" ? (
                  <video
                    src={effectivePreview}
                    className="w-full h-full object-cover"
                    controls
                  >
                    Seu navegador não suporta a reprodução de vídeo.
                  </video>
                ) : (
                  <img
                    src={effectivePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            ) : (
              <div className="w-full aspect-square bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500">
                Nenhuma mídia selecionada
              </div>
            )}

            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                disabled={isUploading || isSaving}
              />

              <select
                value={formData.media_type}
                onChange={handleChange("media_type")}
                className="w-[140px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={isSaving}
              >
                <option value="image">Imagem</option>
                <option value="video">Vídeo</option>
              </select>
            </div>
          </div>

          {/* Botões */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {post && onDelete && (
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  if (
                    !isDeleting &&
                    window.confirm("Tem certeza que deseja excluir este post?")
                  ) {
                    onDelete();
                  }
                }}
                disabled={isSaving || isUploading || isDeleting}
              >
                {isDeleting ? "Excluindo..." : "Excluir post"}
              </Button>
            )}

            <div className="flex gap-3 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700"
                disabled={isSaving || isUploading || isDeleting}
              >
                {isSaving
                  ? "Salvando..."
                  : post
                  ? "Atualizar Post"
                  : "Criar Post"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
