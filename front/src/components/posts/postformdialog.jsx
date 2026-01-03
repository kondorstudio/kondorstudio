import React, { useEffect, useRef, useState } from "react";
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
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { resolveMediaUrl } from "@/lib/media.js";
import {
  buildStatusPayload,
  resolveWorkflowStatus,
} from "@/utils/postStatus.js";

function formatDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const DEFAULT_SCHEDULE_TIME = "09:00";

function splitDateTime(value) {
  const formatted = formatDateTimeInput(value);
  if (!formatted) return { date: "", time: "" };
  const [date, time] = formatted.split("T");
  return { date, time };
}

function toDateKey(date) {
  if (!(date instanceof Date)) return "";
  return date.toLocaleDateString("en-CA");
}

function buildScheduleDate(date, time) {
  if (!date) return null;
  const safeTime = time || DEFAULT_SCHEDULE_TIME;
  const value = new Date(`${date}T${safeTime}`);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function normalizeScheduleSlots(slots) {
  if (!Array.isArray(slots)) return [];
  return slots
    .map((slot) => ({
      date: typeof slot?.date === "string" ? slot.date : "",
      time: typeof slot?.time === "string" ? slot.time : "",
    }))
    .filter((slot) => slot.date || slot.time);
}

function parseTags(value) {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

export function PostForm({
  open = true,
  onCancel,
  showHeader = true,
  containerClassName = "",
  headerClassName = "",
  post,
  defaultClientId = "",
  initialScheduleDate = null,
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
    platform: "",
  });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [signature, setSignature] = useState("");
  const [scheduleSlots, setScheduleSlots] = useState([{ date: "", time: "" }]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [advancedFields, setAdvancedFields] = useState({
    firstComment: "",
    collaborator: "",
    location: "",
    altText: "",
    disableComments: false,
  });
  const fileInputRef = useRef(null);
  const isActive = open !== false;

  const resetState = () => {
    const metadata = post?.metadata || {};
    const storedSlots = normalizeScheduleSlots(
      metadata.scheduleSlots || metadata.schedule_slots
    );
    const fallbackSlot = post
      ? splitDateTime(
          post.scheduledDate || post.scheduled_date || post.scheduledAt || post.scheduled_at
        )
      : initialScheduleDate
      ? {
          date: toDateKey(new Date(initialScheduleDate)),
          time: DEFAULT_SCHEDULE_TIME,
        }
      : { date: "", time: "" };

    const nextSlots =
      storedSlots.length > 0
        ? storedSlots
        : fallbackSlot.date || fallbackSlot.time
        ? [fallbackSlot]
        : [{ date: "", time: "" }];

    const tagsValue = Array.isArray(post?.tags)
      ? post.tags.join(" ")
      : post?.tags || "";

    const payload = post
      ? {
          title: post.title || "",
          body: post.body || post.caption || "",
          clientId: post.clientId || "",
          status: resolveWorkflowStatus(post) || "DRAFT",
          media_url: post.media_url || post.mediaUrl || "",
          media_type: post.media_type || post.mediaType || "image",
          integrationId:
            post.integrationId ||
            post.integration_id ||
            post.metadata?.integrationId ||
            post.metadata?.integration_id ||
            "",
          platform:
            post.platform ||
            post.metadata?.platform ||
            post.metadata?.platform_name ||
            "",
        }
      : {
          title: "",
          body: "",
          clientId: defaultClientId || "",
          status: "DRAFT",
          media_url: "",
          media_type: "image",
          integrationId: "",
          platform: "",
        };

    setFormData(payload);
    setTagsInput(tagsValue);
    setSignature(metadata.signature || "");
    setScheduleSlots(nextSlots);
    setAdvancedFields({
      firstComment: metadata.firstComment || "",
      collaborator: metadata.collaborator || "",
      location: metadata.location || "",
      altText: metadata.altText || "",
      disableComments: Boolean(metadata.disableComments),
    });
    setAdvancedOpen(false);
    setFile(null);
    const initialMedia = payload.media_url
      ? resolveMediaUrl(payload.media_url)
      : null;
    setPreviewUrl(initialMedia);
  };

  useEffect(() => {
    if (!isActive) return;
    resetState();
  }, [post, isActive, defaultClientId, initialScheduleDate]);

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

  const selectedClient = React.useMemo(
    () => clients.find((client) => client.id === formData.clientId) || null,
    [clients, formData.clientId]
  );

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

  const platformOptions = React.useMemo(() => {
    if (!selectedIntegration) return [];
    const kind = selectedIntegration.settings?.kind;
    if (kind === "meta_business") {
      const options = [];
      const settings = selectedIntegration.settings || {};
      if (settings.igBusinessId || settings.ig_business_id) {
        options.push({ value: "instagram", label: "Instagram" });
      }
      if (settings.pageId || settings.page_id) {
        options.push({ value: "facebook", label: "Facebook" });
      }
      return options.length ? options : [
        { value: "instagram", label: "Instagram" },
        { value: "facebook", label: "Facebook" },
      ];
    }
    if (kind === "instagram_only") return [{ value: "instagram", label: "Instagram" }];
    if (kind === "tiktok") return [{ value: "tiktok", label: "TikTok" }];
    return [];
  }, [selectedIntegration]);

  useEffect(() => {
    if (!selectedIntegration) return;
    const current = formData.platform;
    const available = platformOptions.map((opt) => opt.value);
    if (current && available.includes(current)) return;
    if (available.length === 1) {
      setFormData((prev) => ({ ...prev, platform: available[0] }));
    }
  }, [formData.platform, platformOptions, selectedIntegration]);

  useEffect(() => {
    if (selectedIntegration) return;
    if (!formData.platform) return;
    setFormData((prev) => ({ ...prev, platform: "" }));
  }, [formData.platform, selectedIntegration]);

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

  const updateScheduleSlot = (index, field, value) => {
    setScheduleSlots((prev) =>
      prev.map((slot, idx) =>
        idx === index ? { ...slot, [field]: value } : slot
      )
    );
  };

  const addScheduleSlot = () => {
    setScheduleSlots((prev) => [...prev, { date: "", time: "" }]);
  };

  const removeScheduleSlot = (index) => {
    setScheduleSlots((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateAdvancedField = (field, value) => {
    setAdvancedFields((prev) => ({ ...prev, [field]: value }));
  };

  const buildCaption = () => {
    const base = formData.body || "";
    const signatureText = signature?.trim();
    if (!signatureText) return base;
    return base ? `${base}\n\n${signatureText}` : signatureText;
  };

  const submitPost = async (statusOverride) => {
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
    if (platformOptions.length > 1 && !formData.platform) {
      alert("Selecione o canal de publicação.");
      return;
    }

    const cleanedSlots = normalizeScheduleSlots(scheduleSlots);
    const primarySlot = cleanedSlots.find((slot) => slot.date) || null;
    const scheduledDate = primarySlot
      ? buildScheduleDate(primarySlot.date, primarySlot.time)
      : null;

    const chosenStatus = statusOverride || formData.status || "DRAFT";
    if (chosenStatus === "SCHEDULED" && !scheduledDate) {
      alert("Informe a data e horário para agendar.");
      return;
    }

    try {
      setIsUploading(true);
      let mediaUrlToSave = formData.media_url || null;

      if (file) {
        const { url } = await base44.uploads.uploadFile(file, {
          folder: "posts",
          isPublic: true,
        });
        mediaUrlToSave = url;
      }

      const statusPayload = buildStatusPayload(chosenStatus);
      const caption = buildCaption();
      const payload = {
        ...formData,
        body: caption,
        caption,
        media_url: mediaUrlToSave,
        status: statusPayload.status,
        tags: parseTags(tagsInput),
        integrationId: formData.integrationId || null,
        integrationKind: selectedIntegration?.settings?.kind || null,
        integrationProvider: selectedIntegration?.provider || null,
        platform: formData.platform || resolvePlatformValue(selectedIntegration),
        scheduledDate,
        publishedDate: chosenStatus === "DONE" ? new Date().toISOString() : null,
        metadata: {
          ...(statusPayload.metadata || {}),
          scheduleSlots: cleanedSlots,
          signature: signature || null,
          firstComment: advancedFields.firstComment || null,
          collaborator: advancedFields.collaborator || null,
          location: advancedFields.location || null,
          altText: advancedFields.altText || null,
          disableComments: advancedFields.disableComments || false,
        },
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

  const handleSubmit = (event) => {
    event.preventDefault();
    submitPost();
  };

  const effectivePreview = previewUrl;
  const StepCard = ({ step, title, subtitle, children }) => (
    <div className="rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-light)] text-xs font-semibold text-[var(--primary)]">
            {step}
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
            {subtitle ? (
              <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );

  return (
    <div className={`flex h-full flex-col ${containerClassName}`}>
      {showHeader ? (
        <DialogHeader
          className={`border-b border-[var(--border)] px-6 py-4 ${headerClassName}`}
        >
          <DialogTitle>{post ? "Editar post" : "Novo post"}</DialogTitle>
          <p className="text-xs text-[var(--text-muted)]">
            Configure perfis, canais, conteudo e agendamento no mesmo fluxo.
          </p>
        </DialogHeader>
      ) : null}

      <form onSubmit={handleSubmit} className="flex h-full flex-col">
        <div className="grid flex-1 gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <StepCard
              step="1"
              title="Selecione perfis"
              subtitle="Escolha o perfil e um grupo (opcional)."
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <select
                    value={formData.clientId}
                    onChange={handleChange("clientId")}
                    className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(109,40,217,0.2)]"
                  >
                    <option value="">Selecione um cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="button" variant="outline" size="sm" className="self-end">
                  Selecionar um grupo
                </Button>
              </div>
            </StepCard>

              <StepCard
                step="2"
                title="Selecione canais"
                subtitle="Defina a rede social e o canal de publicacao."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Rede social</Label>
                    <select
                      value={formData.integrationId}
                      onChange={handleChange("integrationId")}
                      className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(109,40,217,0.2)]"
                      disabled={!formData.clientId || postingIntegrations.length === 0}
                    >
                      <option value="">
                        {formData.clientId
                          ? postingIntegrations.length
                            ? "Selecione uma rede"
                            : "Nenhuma integracao encontrada"
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
                        Cadastre uma integracao deste cliente antes de publicar.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>Canal</Label>
                    <div className="flex flex-wrap gap-2">
                      {platformOptions.length > 0 ? (
                        platformOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                platform: opt.value,
                              }))
                            }
                            className={`rounded-[10px] border px-3 py-2 text-xs font-semibold transition ${
                              formData.platform === opt.value
                                ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">
                          Selecione uma rede para ver os canais.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </StepCard>

              <StepCard
                step="3"
                title="Texto do post"
                subtitle="Escreva a legenda e personalize hashtags."
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center rounded-[10px] border border-[var(--border)] bg-white p-1">
                    <button
                      type="button"
                      className="h-8 rounded-[8px] px-3 text-xs font-semibold text-[var(--primary)] bg-[var(--primary-light)]"
                    >
                      Todos
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    leftIcon={Sparkles}
                    onClick={() => setShowAiHelper((prev) => !prev)}
                  >
                    Criar legenda - IA
                  </Button>
                </div>

                {showAiHelper ? (
                  <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-muted)]">
                    Configure o contexto do post para gerar legendas com IA (em breve).
                  </div>
                ) : null}

                <Textarea
                  value={formData.body}
                  onChange={handleChange("body")}
                  placeholder="Digite o texto do post"
                  rows={6}
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Hashtags</Label>
                    <Input
                      value={tagsInput}
                      onChange={(event) => setTagsInput(event.target.value)}
                      placeholder="#campanha #marca"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Assinatura</Label>
                    <Input
                      value={signature}
                      onChange={(event) => setSignature(event.target.value)}
                      placeholder="Assinatura do perfil"
                    />
                  </div>
                </div>
              </StepCard>

              <StepCard
                step="4"
                title="Midias"
                subtitle="Envie imagens, videos ou documentos."
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUploading || isSaving}
                />
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    {effectivePreview ? (
                      <div className="w-full aspect-square overflow-hidden rounded-[12px] bg-white">
                        {formData.media_type === "video" ? (
                          <video
                            src={effectivePreview}
                            className="h-full w-full object-cover"
                            controls
                          >
                            Seu navegador nao suporta a reproducao de video.
                          </video>
                        ) : (
                          <img
                            src={effectivePreview}
                            alt="Preview"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                        <ImageIcon className="h-6 w-6 text-[var(--text-muted)]" />
                        Nenhuma midia selecionada
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="secondary" size="sm" disabled leftIcon={ImageIcon}>
                      Editor
                    </Button>
                    <Button type="button" variant="secondary" size="sm" disabled leftIcon={Sparkles}>
                      Canva
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={Upload}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isSaving}
                    >
                      Upload
                    </Button>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      PNG, JPG ou MP4.
                    </p>
                  </div>
                </div>
              </StepCard>

              <StepCard
                step="5"
                title="Data e horario das publicacoes"
                subtitle="Defina um ou mais horarios para publicar."
              >
                <div className="space-y-3">
                  {scheduleSlots.map((slot, index) => (
                    <div
                      key={`slot-${index}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <div className="relative flex-1 min-w-[160px]">
                        <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                        <Input
                          type="date"
                          value={slot.date}
                          onChange={(event) =>
                            updateScheduleSlot(index, "date", event.target.value)
                          }
                          className="pl-9"
                        />
                      </div>
                      <div className="relative w-[140px]">
                        <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                        <Input
                          type="time"
                          value={slot.time}
                          onChange={(event) =>
                            updateScheduleSlot(index, "time", event.target.value)
                          }
                          className="pl-9"
                        />
                      </div>
                      {scheduleSlots.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeScheduleSlot(index)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                          aria-label="Remover horario"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  leftIcon={Plus}
                  onClick={addScheduleSlot}
                >
                  Incluir mais dias e horarios
                </Button>
              </StepCard>

              <StepCard
                step="6"
                title="Configuracoes avancadas"
                subtitle="Opcoes extras para o post."
              >
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-[10px] border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text)]"
                >
                  {advancedOpen ? "Ocultar opcoes" : "Abrir configuracoes"}
                  {advancedOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {advancedOpen ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Primeiro comentario</Label>
                      <Textarea
                        value={advancedFields.firstComment}
                        onChange={(event) =>
                          updateAdvancedField("firstComment", event.target.value)
                        }
                        rows={3}
                        placeholder="Comentario fixo para o post"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Colaborador</Label>
                      <Input
                        value={advancedFields.collaborator}
                        onChange={(event) =>
                          updateAdvancedField("collaborator", event.target.value)
                        }
                        placeholder="@colaborador"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Localizacao</Label>
                      <Input
                        value={advancedFields.location}
                        onChange={(event) =>
                          updateAdvancedField("location", event.target.value)
                        }
                        placeholder="Cidade, endereco ou ponto"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Texto alternativo</Label>
                      <Input
                        value={advancedFields.altText}
                        onChange={(event) =>
                          updateAdvancedField("altText", event.target.value)
                        }
                        placeholder="Descricao para acessibilidade"
                      />
                    </div>
                    <div className="flex items-center gap-2 md:col-span-2">
                      <Checkbox
                        checked={advancedFields.disableComments}
                        onCheckedChange={(value) =>
                          updateAdvancedField("disableComments", Boolean(value))
                        }
                      />
                      <span className="text-xs text-[var(--text-muted)]">
                        Desativar comentarios
                      </span>
                    </div>
                  </div>
                ) : null}
              </StepCard>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      Configuracoes avancadas
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Primeiro comentario, localizacao, colaborador.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdvancedOpen((prev) => !prev)}
                  >
                    {advancedOpen ? "Fechar" : "Abrir"}
                  </Button>
                </div>
              </div>

              <div className="rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Preview</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {selectedClient?.name || "Selecione um perfil"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--primary)]"
                  >
                    Ver todos
                  </button>
                </div>

                <div className="mt-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  {effectivePreview ? (
                    <div className="aspect-square overflow-hidden rounded-[12px] bg-white">
                      {formData.media_type === "video" ? (
                        <video
                          src={effectivePreview}
                          className="h-full w-full object-cover"
                          controls
                        />
                      ) : (
                        <img
                          src={effectivePreview}
                          alt="Preview"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex h-[220px] items-center justify-center text-xs text-[var(--text-muted)]">
                      Preview indisponivel
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {formData.title || "Titulo do post"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] line-clamp-3">
                    {buildCaption() || "A legenda do post aparece aqui."}
                  </p>
                </div>
              </div>
            </aside>
          </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-white px-6 py-4">
          {post && onDelete ? (
            <Button
              type="button"
              variant="danger"
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
          ) : (
            <div />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (onCancel) onCancel();
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => submitPost("DRAFT")}
              disabled={isSaving || isUploading || isDeleting}
            >
              Salvar rascunho
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => submitPost("CLIENT_APPROVAL")}
              disabled={isSaving || isUploading || isDeleting}
            >
              Enviar para aprovacao
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => submitPost("DONE")}
              disabled={isSaving || isUploading || isDeleting}
            >
              Publicar agora
            </Button>
            <Button
              type="button"
              onClick={() => submitPost("SCHEDULED")}
              disabled={isSaving || isUploading || isDeleting}
            >
              {isSaving ? "Salvando..." : "Agendar"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function Postformdialog({ open, onClose, ...props }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-0">
        <PostForm
          {...props}
          open={open}
          onCancel={onClose}
          containerClassName="h-full"
        />
      </DialogContent>
    </Dialog>
  );
}
