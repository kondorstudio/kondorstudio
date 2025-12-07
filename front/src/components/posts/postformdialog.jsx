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
import { Upload, Image as ImageIcon, Video } from "lucide-react";

function normalizeMediaUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const base = (base44.API_BASE_URL || "").replace(/\/$/, "");
  const suffix = url.startsWith("/") ? url : `/${url}`;
  return base ? `${base}${suffix}` : suffix;
}

function resolvePreview(url) {
  if (!url) return "";
  if (url.startsWith("blob:")) return url;
  return normalizeMediaUrl(url);
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
  const [previewUrl, setPreviewUrl] = useState("");
  const [storedMediaUrl, setStoredMediaUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    // Sempre que abrir o modal para edição, pré-carrega a mídia existente para o preview.
    if (!open && !post) {
      return;
    }
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

    const initialMedia = resolvePreview(payload.media_url || "");
    setFormData(payload);
    setStoredMediaUrl(initialMedia);
    setPreviewUrl(initialMedia);
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

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      const { url } = await base44.uploads.uploadFile(file, {
        folder: "posts",
      });
      const normalized = normalizeMediaUrl(url);
      setFormData((prev) => ({ ...prev, media_url: normalized }));
      setStoredMediaUrl(normalized);
      // Mantém o preview local até o usuário reabrir o modal (evita flicker)
    } catch (error) {
      console.error("Upload error:", error);
      alert("Falha ao enviar arquivo. Tente novamente.");
      setPreviewUrl(storedMediaUrl);
    }
    setIsUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.clientId) {
      alert("Selecione um cliente antes de salvar o post.");
      return;
    }
    if (!formData.title.trim()) {
      alert("Informe um título para o post.");
      return;
    }
    if (!formData.media_url) {
      alert("Envie um arquivo de mídia antes de salvar.");
      return;
    }
    if (onSubmit) {
      onSubmit(formData);
    }
  };

  const effectivePreview = resolvePreview(previewUrl || storedMediaUrl);

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

            {effectivePreview && (
              // Preview usa a URL persistida ou o blob recém-enviado para evitar imagem quebrada ao editar.
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
            )}

            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept="image/*,video/*"
                onChange={handleUpload}
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
