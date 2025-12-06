import React, { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox.jsx";
import { base44 } from "@/apiClient/base44Client";
import { Upload } from "lucide-react";

const defaultForm = {
  name: "",
  email: "",
  phone: "",
  sector: "",
  briefing: "",
  monthlyFee: "",
  renewalDate: "",
  website: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  tags: "",
  notes: "",
  logoUrl: "",
  portalEmail: "",
  billingContactName: "",
  billingContactEmail: "",
  whatsappOptIn: false,
};

function formatDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function formatMonthlyFee(value) {
  if (!value && value !== 0) return "";
  return (value / 100).toString().replace(".", ",");
}

export default function ClientFormDialog({
  open,
  onClose,
  client,
  onSubmit,
  submitting,
}) {
  const [formData, setFormData] = useState(defaultForm);

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || "",
        email: client.email || "",
        phone: client.phone || "",
        sector: client.sector || "",
        briefing: client.briefing || "",
        monthlyFee: formatMonthlyFee(client.monthlyFeeCents),
        renewalDate: formatDateInput(client.renewalDate),
        website: client.website || "",
        instagram: client.instagram ? `@${client.instagram}` : "",
        facebook: client.facebook ? `@${client.facebook}` : "",
        tiktok: client.tiktok ? `@${client.tiktok}` : "",
        tags: Array.isArray(client.tags) ? client.tags.join(", ") : "",
        notes: client.notes || "",
        logoUrl: client.logoUrl || client.logo_url || "",
        portalEmail: client.portalEmail || client.email || "",
        billingContactName: client.billingContactName || "",
        billingContactEmail: client.billingContactEmail || "",
        whatsappOptIn: Boolean(client.whatsappOptIn),
      });
    } else {
      setFormData(defaultForm);
    }
  }, [client]);

  const handleChange = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCheckbox = (field) => (checked) => {
    setFormData((prev) => ({ ...prev, [field]: checked }));
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result =
        (base44.integrations &&
          base44.integrations.Core &&
          (await base44.integrations.Core.UploadFile({ file }))) ||
        null;
      if (result?.file_url) {
        setFormData((prev) => ({ ...prev, logoUrl: result.file_url }));
      }
    } catch (error) {
      console.error("Erro no upload do logo:", error);
      alert("Falha ao enviar o logo. Tente novamente.");
    }
  };

  const normalizedPayload = useMemo(() => {
    const tags = formData.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    return {
      name: formData.name.trim(),
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      sector: formData.sector.trim() || null,
      briefing: formData.briefing.trim() || null,
      monthlyFee: formData.monthlyFee,
      renewalDate: formData.renewalDate || null,
      website: formData.website.trim() || null,
      instagram: formData.instagram.replace(/^@/, "").trim() || null,
      facebook: formData.facebook.replace(/^@/, "").trim() || null,
      tiktok: formData.tiktok.replace(/^@/, "").trim() || null,
      tags,
      notes: formData.notes.trim() || null,
      logoUrl: formData.logoUrl || null,
      portalEmail:
        formData.portalEmail.trim() || formData.email.trim() || null,
      billingContactName: formData.billingContactName.trim() || null,
      billingContactEmail: formData.billingContactEmail.trim() || null,
      whatsappOptIn: Boolean(formData.whatsappOptIn),
    };
  }, [formData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    if (!normalizedPayload.name) {
      alert("Informe o nome do cliente.");
      return;
    }
    onSubmit(normalizedPayload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{client ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={handleChange("name")}
                placeholder="Nome da empresa / cliente"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Setor</Label>
              <Input
                value={formData.sector}
                onChange={handleChange("sector")}
                placeholder="Ex: Saúde, Construção, Moda..."
              />
            </div>

            <div className="space-y-2">
              <Label>E-mail principal</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={handleChange("email")}
                placeholder="contato@empresa.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={formData.phone}
                onChange={handleChange("phone")}
                placeholder="+55 (11) 99999-9999"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Briefing / contexto</Label>
            <Textarea
              value={formData.briefing}
              onChange={handleChange("briefing")}
              rows={3}
              placeholder="Descreva os objetivos, histórico e expectativas do cliente"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor Mensal (R$)</Label>
              <Input
                value={formData.monthlyFee}
                onChange={handleChange("monthlyFee")}
                placeholder="Ex: 3.500,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Renovação</Label>
              <Input
                type="date"
                value={formData.renewalDate}
                onChange={handleChange("renewalDate")}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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
                placeholder="@pagina"
              />
            </div>
            <div className="space-y-2">
              <Label>TikTok</Label>
              <Input
                value={formData.tiktok}
                onChange={handleChange("tiktok")}
                placeholder="@perfil"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags (separadas por vírgula)</Label>
            <Input
              value={formData.tags}
              onChange={handleChange("tags")}
              placeholder="vip, mensal, prioritário"
            />
          </div>

  <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Responsável financeiro</Label>
              <Input
                value={formData.billingContactName}
                onChange={handleChange("billingContactName")}
                placeholder="Nome"
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail financeiro</Label>
              <Input
                type="email"
                value={formData.billingContactEmail}
                onChange={handleChange("billingContactEmail")}
                placeholder="financeiro@empresa.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas Internas / acessos</Label>
            <Textarea
              value={formData.notes}
              onChange={handleChange("notes")}
              rows={3}
              placeholder="Informações privadas da equipe (senhas, instruções, links)"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>E-mail do portal do cliente</Label>
              <Input
                type="email"
                value={formData.portalEmail}
                onChange={handleChange("portalEmail")}
                placeholder="cliente@empresa.com"
              />
              <p className="text-xs text-gray-500">
                Geraremos uma senha temporária automaticamente e exibiremos após o cadastro.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Logo do Cliente</Label>

              {formData.logoUrl && (
                <img
                  src={formData.logoUrl}
                  alt="Logo do cliente"
                  className="w-20 h-20 object-contain rounded-lg border bg-white"
                />
              )}

              <div className="flex items-center gap-3">
                <Input type="file" accept="image/*" onChange={handleUpload} />
                <Upload className="w-5 h-5 text-gray-500" />
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="whatsappOptIn"
              checked={formData.whatsappOptIn}
              onCheckedChange={handleCheckbox("whatsappOptIn")}
            />
            <Label htmlFor="whatsappOptIn" className="text-sm text-gray-600">
              Cliente autorizou receber comunicações por WhatsApp
            </Label>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700"
              disabled={submitting}
            >
              {submitting ? "Salvando..." : client ? "Salvar alterações" : "Criar Cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
