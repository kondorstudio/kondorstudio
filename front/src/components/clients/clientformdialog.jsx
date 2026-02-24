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
import { FormGrid, FormHint, FormSection } from "@/components/ui/form.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { base44 } from "@/apiClient/base44Client";
import { Building2, FileText, Image as ImageIcon, Lock, Share2, Upload, Wallet } from "lucide-react";

const defaultForm = {
  name: "",
  email: "",
  phone: "",
  whatsappNumberE164: "",
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
  whatsappOptIn: true,
  portalPassword: "",
};

function normalizeE164Input(value) {
  if (value === undefined || value === null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

function isValidE164(value) {
  return /^\+\d{8,15}$/.test(String(value || "").trim());
}

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
        whatsappNumberE164: client.whatsappNumberE164 || "",
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
        portalPassword: "",
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
      const { url } = await base44.uploads.uploadFile(file, { folder: "clients" });
      setFormData((prev) => ({ ...prev, logoUrl: url }));
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
      whatsappNumberE164:
        normalizeE164Input(formData.whatsappNumberE164) || null,
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
      portalPassword: formData.portalPassword.trim() || undefined,
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
    const normalizedWhatsapp = normalizeE164Input(formData.whatsappNumberE164);
    if (!client && !normalizedWhatsapp) {
      alert(
        "Informe o WhatsApp do cliente em formato internacional (+55...) para concluir o cadastro."
      );
      return;
    }
    if (normalizedWhatsapp && !isValidE164(normalizedWhatsapp)) {
      alert("WhatsApp inválido. Use o formato E.164 (+5511999999999).");
      return;
    }
    onSubmit(normalizedPayload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <FormSection
            title="Informacoes basicas"
            description="Dados principais e contexto do cliente."
            icon={Building2}
          >
            <FormGrid>
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
                  placeholder="Ex: Saude, Construcao, Moda..."
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
              <div className="space-y-2">
                <Label>WhatsApp do cliente {!client ? "*" : ""}</Label>
                <Input
                  value={formData.whatsappNumberE164}
                  onChange={handleChange("whatsappNumberE164")}
                  placeholder="+5511999999999"
                  required={!client}
                />
                <FormHint>
                  Usado para aprovações de posts e envio de relatórios.
                </FormHint>
                {client && !normalizeE164Input(formData.whatsappNumberE164) ? (
                  <p className="text-xs text-amber-700">
                    Cliente legado sem WhatsApp cadastrado. Recomendado preencher
                    para habilitar automações.
                  </p>
                ) : null}
              </div>
            </FormGrid>

            <div className="mt-4 space-y-2">
              <Label>Briefing / contexto</Label>
              <Textarea
                value={formData.briefing}
                onChange={handleChange("briefing")}
                rows={3}
                placeholder="Descreva os objetivos, historico e expectativas do cliente"
              />
            </div>
          </FormSection>

          <FormSection
            title="Financeiro e renovacao"
            description="Controle de contrato e pontos de contato financeiro."
            icon={Wallet}
          >
            <FormGrid>
              <div className="space-y-2">
                <Label>Valor Mensal (R$)</Label>
                <Input
                  value={formData.monthlyFee}
                  onChange={handleChange("monthlyFee")}
                  placeholder="Ex: 3.500,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Renovacao</Label>
                <DateField
                  value={formData.renewalDate}
                  onChange={handleChange("renewalDate")}
                />
              </div>
              <div className="space-y-2">
                <Label>Responsavel financeiro</Label>
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
            </FormGrid>
          </FormSection>

          <FormSection
            title="Canais sociais"
            description="Perfis e presenca digital do cliente."
            icon={Share2}
          >
            <FormGrid>
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
              <div className="space-y-2 md:col-span-2">
                <Label>Tags (separadas por virgula)</Label>
                <Input
                  value={formData.tags}
                  onChange={handleChange("tags")}
                  placeholder="vip, mensal, prioritario"
                />
              </div>
            </FormGrid>
          </FormSection>

          <FormSection
            title="Portal e notas"
            description="Acesso do cliente e observacoes internas."
            icon={Lock}
          >
            <FormGrid>
              <div className="space-y-2">
                <Label>E-mail do portal do cliente</Label>
                <Input
                  type="email"
                  value={formData.portalEmail}
                  onChange={handleChange("portalEmail")}
                  placeholder="cliente@empresa.com"
                />
                <FormHint>
                  Informe um e-mail que o cliente usara para acessar o portal.
                </FormHint>
              </div>

              <div className="space-y-2">
                <Label>Senha do portal</Label>
                <Input
                  type="text"
                  value={formData.portalPassword}
                  onChange={handleChange("portalPassword")}
                  placeholder="Defina a senha de acesso"
                />
                <FormHint>
                  Se vazio, geramos automaticamente e exibimos apos o cadastro.
                </FormHint>
              </div>
            </FormGrid>

            <div className="mt-4 space-y-2">
              <Label>Notas Internas / acessos</Label>
              <Textarea
                value={formData.notes}
                onChange={handleChange("notes")}
                rows={3}
                placeholder="Informacoes privadas da equipe (senhas, instrucoes, links)"
              />
            </div>

            <div className="mt-4 flex items-center space-x-2">
              <Checkbox
                id="whatsappOptIn"
                checked={formData.whatsappOptIn}
                onCheckedChange={handleCheckbox("whatsappOptIn")}
              />
              <Label htmlFor="whatsappOptIn" className="text-sm text-gray-600">
                Cliente autorizou receber comunicacoes por WhatsApp
              </Label>
            </div>
          </FormSection>

          <FormSection
            title="Identidade visual"
            description="Logo e materiais basicos do cliente."
            icon={ImageIcon}
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-[16px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)]">
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt="Logo do cliente"
                    className="h-full w-full object-contain rounded-[16px] bg-white"
                  />
                ) : (
                  <FileText className="h-6 w-6 text-[var(--text-muted)]" />
                )}
              </div>
              <div className="space-y-2">
                <Label>Logo do cliente</Label>
                <div className="flex items-center gap-3">
                  <Input type="file" accept="image/*" onChange={handleUpload} />
                  <Upload className="w-5 h-5 text-gray-500" />
                </div>
                <FormHint>PNG ou JPG com fundo transparente.</FormHint>
              </div>
            </div>
          </FormSection>

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
