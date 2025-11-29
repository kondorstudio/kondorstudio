import React, { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function TeamFormDialog({ open, onClose, member }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "social_media",
    permissions: {
      clients: true,
      posts: true,
      tasks: true,
      metrics: false,
      team: false,
      settings: false
    }
  });

  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name || "",
        email: member.email || "",
        role: member.role || "social_media",
        permissions: member.permissions || {
          clients: true,
          posts: true,
          tasks: true,
          metrics: false,
          team: false,
          settings: false
        }
      });
    } else {
      setFormData({
        name: "",
        email: "",
        role: "social_media",
        permissions: {
          clients: true,
          posts: true,
          tasks: true,
          metrics: false,
          team: false,
          settings: false
        }
      });
    }
  }, [member]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const tenants = await base44.entities.Tenant.list();
      const payload = {
        ...data,
        tenant_id: tenants[0].id
      };

      if (member) {
        return base44.entities.TeamMember.update(member.id, payload);
      } else {
        return base44.entities.TeamMember.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const togglePermission = (key) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{member ? 'Editar Membro' : 'Novo Membro'}</DialogTitle>
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
            <Label className="text-gray-900">Email *</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
              className="bg-white border-gray-300"
            />
          </div>

          <div>
            <Label className="text-gray-900">Função</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => setFormData({...formData, role: value})}
            >
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="traffic_manager">Gestor de Tráfego</SelectItem>
                <SelectItem value="designer">Designer</SelectItem>
                <SelectItem value="social_media">Social Media</SelectItem>
                <SelectItem value="copywriter">Copywriter</SelectItem>
                <SelectItem value="videomaker">Videomaker</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-3 block text-gray-900">Permissões</Label>
            <div className="space-y-2 bg-gray-50 p-4 rounded-lg border border-gray-300">
              {Object.keys(formData.permissions).map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={key}
                    checked={formData.permissions[key]}
                    onCheckedChange={() => togglePermission(key)}
                  />
                  <label htmlFor={key} className="text-sm capitalize cursor-pointer text-gray-900">
                    {key.replace('_', ' ')}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Salvando...' : member ? 'Atualizar' : 'Adicionar Membro'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}