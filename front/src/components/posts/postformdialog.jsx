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

function resolvePreview(raw) {
  if (!raw) return "";
  if (raw.startsWith("blob:") || /^https?:\/\//i.test(raw)) {
    return raw;
  }

  const envBase =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_URL) ||
    (base44.API_BASE_URL || "");

  const normalizedBase = envBase.replace(/\/$/, "");
  const suffix = raw.startsWith("/") ? raw : `/${raw}`;

  return normalizedBase ? `${normalizedBase}${suffix}` : raw;
}

export default function Postformdialog({
  open,
  onClose,
  post,
  clients = [],
  onSubmit,
  isSaving,
}) {
  const [formData, setFormData] = useState({
    title: "",
    body: "",
    clientId: "",
    status: "DRAFT",
    media_url: "",
    media_type: "image",
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
        }
      : {
          title: "",
          body: "",
          clientId: "",
          status: "DRAFT",
          media_url: "",
          media_type: "image",
        };

    setFormData(payload);
    setFile(null);
    const initialMedia = payload.media_url
      ? resolvePreview(payload.media_url)
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

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    const objectUrl = URL.createObjectURL(selected);
    setPreviewUrl(objectUrl);
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

    try {
      setIsUploading(true);
      let mediaUrlToSave = formData.media_url || null;

      if (file) {
        const { url } = await base44.uploads.uploadFile(file, {
          folder: "posts",
        });
        mediaUrlToSave = url;
      }

      const payload = {
        ...formData,
        media_url: mediaUrlToSave,
      };

      if (onSubmit) {
        await onSubmit(payload);
      }
    } catch (error) {
      console.error("Erro ao salvar post:", error);
      alert("Erro ao salvar post. Tente novamente.");
    } finally {
      setIsUploading(false);
    }
  };

  const effectivePreview = previewUrl;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {post ? "Editar Post" : "Novo Post"}
          </DialogTitle>
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
                  <Video className="w-16 h-16 text-gray-400" />
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
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700"
              disabled={isSaving || isUploading}
            >
              {isSaving
                ? "Salvando..."
                : post
                ? "Atualizar Post"
                : "Criar Post"}
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
