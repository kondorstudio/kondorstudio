import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";

const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
];

function normalizeHandle(value) {
  if (!value) return "";
  return value.trim().replace(/^@/, "");
}

export default function CompetitorFormDialog({
  open,
  onClose,
  onSubmit,
  isSaving,
  competitor,
  clients = [],
  defaultClientId = "",
}) {
  const [formData, setFormData] = React.useState({
    clientId: defaultClientId || "",
    platform: "instagram",
    username: "",
    name: "",
    notes: "",
  });

  React.useEffect(() => {
    if (!open) return;
    setFormData({
      clientId: competitor?.clientId || defaultClientId || "",
      platform: competitor?.platform || "instagram",
      username: competitor?.username || "",
      name: competitor?.name || "",
      notes: competitor?.notes || "",
    });
  }, [open, competitor, defaultClientId]);

  const handleChange = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      clientId: formData.clientId || null,
      platform: formData.platform || "instagram",
      username: normalizeHandle(formData.username),
      name: formData.name || null,
      notes: formData.notes || null,
    };

    if (!payload.username) {
      alert("Informe o @ do concorrente.");
      return;
    }

    if (onSubmit) onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{competitor ? "Editar concorrente" : "Novo concorrente"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <select
              value={formData.clientId}
              onChange={handleChange("clientId")}
              className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(109,40,217,0.2)]"
            >
              <option value="">Todos os clientes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Rede</Label>
              <select
                value={formData.platform}
                onChange={handleChange("platform")}
                className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(109,40,217,0.2)]"
              >
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>@ do concorrente</Label>
              <Input
                value={formData.username}
                onChange={handleChange("username")}
                placeholder="@concorrente"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nome exibido</Label>
            <Input
              value={formData.name}
              onChange={handleChange("name")}
              placeholder="Nome do concorrente"
            />
          </div>

          <div className="space-y-2">
            <Label>Observacoes</Label>
            <Textarea
              value={formData.notes}
              onChange={handleChange("notes")}
              placeholder="Notas internas sobre o concorrente"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar concorrente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
