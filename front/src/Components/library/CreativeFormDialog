import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
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
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload } from "lucide-react";

export default function CreativeFormDialog({ open, onClose, clients }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    file_url: "",
    file_type: "image",
    client_id: "",
    tags: "",
    notes: ""
  });

  const mutation = useMutation({
    mutationFn: async (data) => {
      const tenants = await base44.entities.Tenant.list();
      const payload = {
        ...data,
        tenant_id: tenants[0].id,
        tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : []
      };
      return base44.entities.Creative.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      onClose();
      setFormData({
        name: "",
        file_url: "",
        file_type: "image",
        client_id: "",
        tags: "",
        notes: ""
      });
    }
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({
        ...prev,
        file_url,
        file_type: file.type.startsWith('video') ? 'video' : 'image',
        name: prev.name || file.name
      }));
    } catch (error) {
      console.error('Upload error:', error);
    }
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Novo Criativo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-900">Nome *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
              className="bg-white border-gray-300"
            />
          </div>

          <div>
            <Label className="text-gray-900">Upload de Arquivo *</Label>
            <div className="mt-2">
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileUpload}
                className="hidden"
                id="creative-upload"
              />
              <label htmlFor="creative-upload">
                <Button type="button" variant="outline" className="w-full bg-white" asChild disabled={uploading}>
                  <span>
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? 'Enviando...' : formData.file_url ? 'Arquivo enviado ✓' : 'Upload de Arquivo'}
                  </span>
                </Button>
              </label>
            </div>
          </div>

          <div>
            <Label className="text-gray-900">Cliente</Label>
            <Select
              value={formData.client_id}
              onValueChange={(value) => setFormData({...formData, client_id: value})}
            >
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Selecione (opcional)" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-900">Tags (separadas por vírgula)</Label>
            <Input
              value={formData.tags}
              onChange={(e) => setFormData({...formData, tags: e.target.value})}
              placeholder="ex: feed, story, produto"
              className="bg-white border-gray-300"
            />
          </div>

          <div>
            <Label className="text-gray-900">Observações</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              rows={3}
              className="bg-white border-gray-300"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700"
              disabled={mutation.isPending || uploading || !formData.file_url}
            >
              {mutation.isPending ? 'Salvando...' : 'Criar Criativo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}