import React, { useState, useEffect } from "react";
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

export default function ClientFormDialog({ open, onClose, client }) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "",
    sector: "",
    website: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    briefing: "",
    monthly_value: "",
    renewal_date: "",
    tags: "",
    internal_notes: ""
  });

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || "",
        sector: client.sector || "",
        website: client.website || "",
        instagram: client.instagram || "",
        facebook: client.facebook || "",
        tiktok: client.tiktok || "",
        briefing: client.briefing || "",
        monthly_value: client.monthly_value || "",
        renewal_date: client.renewal_date || "",
        tags: client.tags?.join(", ") || "",
        internal_notes: client.internal_notes || ""
      });
    } else {
      setFormData({
        name: "",
        sector: "",
        website: "",
        instagram: "",
        facebook: "",
        tiktok: "",
        briefing: "",
        monthly_value: "",
        renewal_date: "",
        tags: "",
        internal_notes: ""
      });
    }
  }, [client]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        monthly_value: data.monthly_value ? parseFloat(data.monthly_value) : null
      };

      if (client) {
        return base44.entities.Client.update(client.id, payload);
      } else {
        return base44.entities.Client.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {client ? "Editar Cliente" : "Novo Cliente"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Cliente</Label>
              <Input
                value={formData.name}
                onChange={handleChange("name")}
                placeholder="Ex: Padaria Central"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Setor / Nicho</Label>
              <Input
                value={formData.sector}
                onChange={handleChange("sector")}
                placeholder="Ex: Alimentação, Estética, Imobiliária..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={formData.website}
                onChange={handleChange("website")}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <Label>Instagram</Label>
              <Input
                value={formData.instagram}
                onChange={handleChange("instagram")}
                placeholder="@usuario"
              />
            </div>

            <div className="space-y-2">
              <Label>Facebook</Label>
              <Input
                value={formData.facebook}
                onChange={handleChange("facebook")}
                placeholder="Página do Facebook"
              />
            </div>

            <div className="space-y-2">
              <Label>TikTok</Label>
              <Input
                value={formData.tiktok}
                onChange={handleChange("tiktok")}
                placeholder="@usuario"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Briefing do Cliente</Label>
            <Textarea
              value={formData.briefing}
              onChange={handleChange("briefing")}
              placeholder="Resumo do negócio, público-alvo, objetivos..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor Mensal (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.monthly_value}
                onChange={handleChange("monthly_value")}
                placeholder="Ex: 1500.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Data de Renovação</Label>
              <Input
                type="date"
                value={formData.renewal_date}
                onChange={handleChange("renewal_date")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags (separadas por vírgula)</Label>
            <Input
              value={formData.tags}
              onChange={handleChange("tags")}
              placeholder="Ex: tráfego pago, social media, premium..."
            />
          </div>

          <div className="space-y-2">
            <Label>Anotações Internas</Label>
            <Textarea
              value={formData.internal_notes}
              onChange={handleChange("internal_notes")}
              placeholder="Informações internas sobre o cliente (não aparecem para o cliente)."
              rows={3}
            />
          </div>

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
              {mutation.isPending ? 'Salvando...' : client ? 'Atualizar' : 'Criar Cliente'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
