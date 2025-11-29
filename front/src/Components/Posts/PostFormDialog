import React, { useEffect, useState } from "react";
import { base44 } from "../../apiClient/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "PENDING_APPROVAL", label: "Aguardando aprovação" },
  { value: "APPROVED", label: "Aprovado" },
  { value: "SCHEDULED", label: "Programado" },
  { value: "PUBLISHED", label: "Publicado" },
  { value: "ARCHIVED", label: "Arquivado" },
];

export default function PostFormDialog({ open, onClose, post, clients = [] }) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: "",
    body: "",
    clientId: "",
    status: "DRAFT",
    mediaUrl: "",
    scheduledAtDate: "",
    scheduledAtTime: "",
  });

  // Preenche form se estiver editando
  useEffect(() => {
    if (post) {
      let scheduledAtDate = "";
      let scheduledAtTime = "";

      if (post.scheduledAt) {
        const d = new Date(post.scheduledAt);
        scheduledAtDate = d.toISOString().slice(0, 10);
        scheduledAtTime = d.toTimeString().slice(0, 5);
      }

      setFormData({
        title: post.title || "",
        body: post.body || "",
        clientId: post.clientId || "",
        status: post.status || "DRAFT",
        mediaUrl: post.mediaUrl || "",
        scheduledAtDate,
        scheduledAtTime,
      });
    } else {
      setFormData({
        title: "",
        body: "",
        clientId: "",
        status: "DRAFT",
        mediaUrl: "",
        scheduledAtDate: "",
        scheduledAtTime: "",
      });
    }
  }, [post]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      // monta scheduledAt (se tiver data/hora)
      let scheduledAt = null;
      if (data.scheduledAtDate) {
        const dateStr = data.scheduledAtDate;
        const timeStr = data.scheduledAtTime || "09:00";
        const iso = `${dateStr}T${timeStr}:00`;
        scheduledAt = new Date(iso).toISOString();
      }

      const payload = {
        title: data.title,
        body: data.body,
        clientId: data.clientId || null,
        status: data.status || "DRAFT",
        mediaUrl: data.mediaUrl || null,
        scheduledAt,
      };

      if (post) {
        return base44.entities.Post.update(post.id, payload);
      } else {
        return base44.entities.Post.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      onClose();
    },
  });

  const handleChange = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {post ? "Editar Post" : "Novo Post"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Linha: Cliente + Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select
                value={formData.clientId}
                onValueChange={handleChange("clientId")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={handleChange("status")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={formData.title}
              onChange={handleChange("title")}
              placeholder="Ex: Post da campanha de Dia das Mães"
              required
            />
          </div>

          {/* Legenda / Corpo */}
          <div className="space-y-2">
            <Label>Legenda / Copy</Label>
            <Textarea
              value={formData.body}
              onChange={handleChange("body")}
              rows={5}
              placeholder="Escreva aqui a legenda do post..."
            />
          </div>

          {/* Mídia + Agendamento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>URL da Mídia (temporário)</Label>
              <Input
                value={formData.mediaUrl}
                onChange={handleChange("mediaUrl")}
                placeholder="https://... (upload real será implementado depois)"
              />
            </div>

            <div className="space-y-2">
              <Label>Data de publicação</Label>
              <Input
                type="date"
                value={formData.scheduledAtDate}
                onChange={handleChange("scheduledAtDate")}
              />
              <Input
                type="time"
                value={formData.scheduledAtTime}
                onChange={handleChange("scheduledAtTime")}
                className="mt-2"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending
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
