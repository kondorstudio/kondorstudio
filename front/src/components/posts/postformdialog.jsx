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
import { SelectNative } from "@/components/ui/select-native.jsx";
import { DateField, TimeField } from "@/components/ui/date-field.jsx";
import { base44 } from "@/apiClient/base44Client";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  Play,
  Repeat,
  Sparkles,
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
const DEFAULT_POST_KIND = "feed";
const DEFAULT_POST_KINDS = [DEFAULT_POST_KIND];
const POST_KIND_OPTIONS = [
  { value: "feed", label: "Feed", icon: LayoutGrid },
  { value: "story", label: "Stories", icon: Layers },
  { value: "reel", label: "Reels", icon: Play },
];
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];
const PLATFORM_COLOR_MAP = {
  instagram: "#E1306C",
  facebook: "#1877F2",
  tiktok: "#0F172A",
};
const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};
const POST_KIND_LABELS = {
  feed: "Feed",
  story: "Stories",
  reel: "Reels",
};
const FLOW_STEPS = [
  { id: "post-step-1", step: "1", title: "Perfil", description: "Cliente e grupo" },
  { id: "post-step-2", step: "2", title: "Canais", description: "Rede e formatos" },
  { id: "post-step-3", step: "3", title: "Legenda", description: "Texto e hashtags" },
  { id: "post-step-4", step: "4", title: "Midia", description: "Upload e preview" },
  { id: "post-step-5", step: "5", title: "Agenda", description: "Data e recorrencia" },
  { id: "post-step-6", step: "6", title: "Extras", description: "Configuracoes avancadas" },
];
const STATUS_PREVIEW = {
  DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  CLIENT_APPROVAL: {
    label: "Em aprovacao",
    className: "bg-amber-100 text-amber-700",
  },
  DONE: { label: "Publicado", className: "bg-emerald-100 text-emerald-700" },
  SCHEDULED: { label: "Agendado", className: "bg-indigo-100 text-indigo-700" },
};

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

function normalizePostKind(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "story" || normalized === "reel" || normalized === "feed") {
    return normalized;
  }
  return null;
}

function normalizePostKinds(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = list
    .map(normalizePostKind)
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizePlatforms(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = list
    .map((item) =>
      item !== null && item !== undefined ? String(item).trim().toLowerCase() : ""
    )
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function buildScheduleDate(date, time) {
  if (!date) return null;
  const safeTime = time || DEFAULT_SCHEDULE_TIME;
  const value = new Date(`${date}T${safeTime}`);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function normalizeRecurrence(schedule) {
  if (!schedule || typeof schedule !== "object") {
    return {
      enabled: false,
      startDate: "",
      endDate: "",
      time: DEFAULT_SCHEDULE_TIME,
      weekdays: [],
    };
  }

  const startDate = typeof schedule.startDate === "string" ? schedule.startDate : "";
  const endDate = typeof schedule.endDate === "string" ? schedule.endDate : "";
  const time = typeof schedule.time === "string" ? schedule.time : DEFAULT_SCHEDULE_TIME;
  const weekdays = Array.isArray(schedule.weekdays)
    ? schedule.weekdays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];

  return {
    enabled: Boolean(schedule.enabled),
    startDate,
    endDate,
    time,
    weekdays: Array.from(new Set(weekdays)),
  };
}

function buildRecurringScheduleSlots(schedule) {
  if (!schedule?.enabled) return [];
  const start = schedule.startDate ? new Date(`${schedule.startDate}T00:00:00`) : null;
  const end = schedule.endDate ? new Date(`${schedule.endDate}T00:00:00`) : null;
  if (!start || Number.isNaN(start.getTime())) return [];
  if (!end || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];

  const weekdaysSet = new Set(schedule.weekdays || []);
  if (weekdaysSet.size === 0) return [];

  const slots = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const time = schedule.time || DEFAULT_SCHEDULE_TIME;

  while (cursor <= last) {
    if (weekdaysSet.has(cursor.getDay())) {
      slots.push({ date: toDateKey(cursor), time });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}

function sortScheduleSlots(slots) {
  if (!Array.isArray(slots)) return [];
  return [...slots].sort((a, b) => {
    const dateCompare = (a.date || "").localeCompare(b.date || "");
    if (dateCompare !== 0) return dateCompare;
    return (a.time || "").localeCompare(b.time || "");
  });
}

function areArraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
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

function formatSlotLabel(slot) {
  if (!slot?.date) return "";
  const time = slot.time || DEFAULT_SCHEDULE_TIME;
  const value = new Date(`${slot.date}T${time}`);
  if (Number.isNaN(value.getTime())) return slot.date;
  const dateLabel = value.toLocaleDateString("pt-BR");
  return slot.time ? `${dateLabel} - ${slot.time}` : dateLabel;
}

function parseTags(value) {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

// Define StepCard at module scope to keep a stable component identity and
// avoid remounts that can reset the main scroll position.
const StepCard = ({ id, step, title, subtitle, badge, children }) => (
  <div
    id={id}
    className="group relative scroll-mt-24 rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] transition-[box-shadow,border-color] duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:shadow-[var(--shadow-md)] hover:border-slate-200/80"
  >
    <div className="absolute left-6 top-12 hidden h-[calc(100%-3.5rem)] w-px bg-gradient-to-b from-[var(--primary)]/45 to-transparent md:block" />
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--primary-light)] text-xs font-semibold text-[var(--primary)] shadow-[var(--shadow-sm)]">
          {step}
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
          {subtitle ? (
            <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {badge ? <div className="flex items-center">{badge}</div> : null}
    </div>
    <div className="mt-4 space-y-4">{children}</div>
  </div>
);

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
    platforms: [],
    postKinds: DEFAULT_POST_KINDS,
  });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [signature, setSignature] = useState("");
  const [scheduleSlots, setScheduleSlots] = useState([{ date: "", time: "" }]);
  const [recurrence, setRecurrence] = useState(normalizeRecurrence(null));
  const [showGeneratedSlots, setShowGeneratedSlots] = useState(false);
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
  const scrollToStep = (stepId) => {
    if (typeof document === "undefined") return;
    const element = document.getElementById(stepId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const resetState = () => {
    const metadata = post?.metadata || {};
    const storedSlots = normalizeScheduleSlots(
      metadata.scheduleSlots || metadata.schedule_slots
    );
    const normalizedRecurrence = normalizeRecurrence(
      metadata.recurrence || metadata.storySchedule || metadata.story_schedule
    );
    const recurringSlots = normalizedRecurrence.enabled
      ? buildRecurringScheduleSlots(normalizedRecurrence)
      : [];
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
        : recurringSlots.length > 0
        ? recurringSlots
        : fallbackSlot.date || fallbackSlot.time
        ? [fallbackSlot]
        : [{ date: "", time: "" }];

    const tagsValue = Array.isArray(post?.tags)
      ? post.tags.join(" ")
      : post?.tags || "";

    const resolvedPostKinds = normalizePostKinds(
      post?.postKinds ||
        post?.post_kinds ||
        metadata.postKinds ||
        metadata.post_kinds ||
        post?.postKind ||
        post?.post_kind ||
        metadata.postKind ||
        metadata.post_kind
    );
    const nextPostKinds = resolvedPostKinds.length
      ? resolvedPostKinds
      : DEFAULT_POST_KINDS;

    let resolvedPlatforms = normalizePlatforms(
      post?.platforms || metadata.platforms
    );
    if (!resolvedPlatforms.length) {
      const fallbackPlatform =
        post?.platform ||
        metadata.platform ||
        metadata.platform_name ||
        post?.metadata?.platform_name ||
        "";
      resolvedPlatforms = normalizePlatforms(fallbackPlatform);
    }

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
          platforms: resolvedPlatforms,
          postKinds: nextPostKinds,
        }
      : {
          title: "",
          body: "",
          clientId: defaultClientId || "",
          status: "DRAFT",
          media_url: "",
          media_type: "image",
          integrationId: "",
          platforms: resolvedPlatforms,
          postKinds: nextPostKinds,
        };

    setFormData(payload);
    setTagsInput(tagsValue);
    setSignature(metadata.signature || "");
    setScheduleSlots(sortScheduleSlots(nextSlots));
    setRecurrence(normalizedRecurrence);
    setShowGeneratedSlots(false);
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
  const selectedPostKinds = React.useMemo(
    () => normalizePostKinds(formData.postKinds),
    [formData.postKinds]
  );
  const selectedPlatforms = React.useMemo(
    () => normalizePlatforms(formData.platforms),
    [formData.platforms]
  );
  const generatedRecurringSlots = React.useMemo(() => {
    if (!recurrence.enabled) return [];
    return sortScheduleSlots(buildRecurringScheduleSlots(recurrence));
  }, [recurrence]);

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
    const available = platformOptions.map((opt) => opt.value);
    if (!selectedIntegration) {
      setFormData((prev) => {
        if (!prev.platforms || prev.platforms.length === 0) return prev;
        return { ...prev, platforms: [] };
      });
      return;
    }

    setFormData((prev) => {
      const current = normalizePlatforms(prev.platforms);
      const filtered = current.filter((value) => available.includes(value));
      const next =
        available.length === 1 && filtered.length === 0
          ? available
          : filtered;
      if (areArraysEqual(current, next)) return prev;
      return { ...prev, platforms: next };
    });
  }, [platformOptions, selectedIntegration]);

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
    setScheduleSlots((prev) => {
      const next = [...prev];
      const existing = next[index] || { date: "", time: "" };
      next[index] = { ...existing, [field]: value };
      return next;
    });
  };

  const toggleRecurrence = (value) => {
    const enabled = Boolean(value);
    setRecurrence((prev) => {
      if (!enabled) {
        setShowGeneratedSlots(false);
        return { ...prev, enabled: false };
      }
      const fallbackDate =
        prev.startDate || scheduleSlots[0]?.date || toDateKey(new Date());
      const fallbackTime =
        prev.time || scheduleSlots[0]?.time || DEFAULT_SCHEDULE_TIME;
      const initialWeekday = fallbackDate
        ? new Date(`${fallbackDate}T00:00:00`).getDay()
        : null;
      return {
        ...prev,
        enabled: true,
        startDate: fallbackDate,
        endDate: prev.endDate || fallbackDate,
        time: fallbackTime,
        weekdays:
          prev.weekdays && prev.weekdays.length
            ? prev.weekdays
            : initialWeekday !== null
            ? [initialWeekday]
            : [],
      };
    });
  };

  const updateRecurrenceField = (field, value) => {
    setRecurrence((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRecurrenceWeekday = (day) => {
    setRecurrence((prev) => {
      const next = new Set(prev.weekdays || []);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return { ...prev, weekdays: Array.from(next) };
    });
  };

  const handlePrimaryDateChange = (event) => {
    const value = event?.target ? event.target.value : event;
    if (recurrence.enabled) {
      setRecurrence((prev) => {
        const next = { ...prev, startDate: value };
        if (!prev.endDate || (value && prev.endDate < value)) {
          next.endDate = value;
        }
        return next;
      });
      return;
    }
    updateScheduleSlot(0, "date", value);
  };

  const handlePrimaryTimeChange = (event) => {
    const value = event?.target ? event.target.value : event;
    if (recurrence.enabled) {
      updateRecurrenceField("time", value);
      return;
    }
    updateScheduleSlot(0, "time", value);
  };

  const togglePlatform = (value) => {
    setFormData((prev) => {
      const current = normalizePlatforms(prev.platforms);
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, platforms: next };
    });
  };

  const togglePostKind = (value) => {
    setFormData((prev) => {
      const current = normalizePostKinds(prev.postKinds);
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, postKinds: next };
    });
  };

  const updateAdvancedField = (field, value) => {
    setAdvancedFields((prev) => ({ ...prev, [field]: value }));
  };

  const buildCaption = () => {
    const base = formData.body || "";
    const signatureText = signature?.trim();
    const tags = parseTags(tagsInput).join(" ");
    const parts = [];
    if (base) parts.push(base);
    if (signatureText) parts.push(signatureText);
    if (tags) parts.push(tags);
    return parts.join("\n\n");
  };

  const submitPost = async (statusOverride) => {
    if (!formData.clientId) {
      alert("Selecione um cliente antes de salvar o post.");
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
    const selectedPlatformsValue = normalizePlatforms(formData.platforms);
    if (platformOptions.length > 0 && selectedPlatformsValue.length === 0) {
      alert("Selecione ao menos um canal de publicação.");
      return;
    }

    const normalizedPostKinds = normalizePostKinds(formData.postKinds);
    if (normalizedPostKinds.length === 0) {
      alert("Selecione ao menos um tipo de post.");
      return;
    }

    const primaryPostKind = normalizedPostKinds[0] || DEFAULT_POST_KIND;
    const recurringSlots = recurrence.enabled
      ? buildRecurringScheduleSlots(recurrence)
      : [];
    const cleanedSlots = sortScheduleSlots(
      normalizeScheduleSlots(recurringSlots.length ? recurringSlots : scheduleSlots)
    );
    const primarySlot = cleanedSlots.find((slot) => slot.date) || null;
    const scheduledDate = primarySlot
      ? buildScheduleDate(primarySlot.date, primarySlot.time)
      : null;

    if (recurrence.enabled && cleanedSlots.length === 0) {
      alert("Selecione os dias e o periodo para repetir o agendamento.");
      return;
    }

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
      const recurrencePayload = recurrence.enabled
        ? {
            enabled: true,
            startDate: recurrence.startDate || null,
            endDate: recurrence.endDate || null,
            time: recurrence.time || DEFAULT_SCHEDULE_TIME,
            weekdays: recurrence.weekdays || [],
          }
        : null;

      const primaryPlatform =
        selectedPlatformsValue[0] || resolvePlatformValue(selectedIntegration);

      const trimmedTitle = formData.title ? formData.title.trim() : "";
      const fallbackTitle = trimmedTitle
        ? trimmedTitle
        : caption
        ? caption.split("\n")[0].slice(0, 60)
        : "Post sem titulo";

      const payload = {
        ...formData,
        title: fallbackTitle,
        postKind: primaryPostKind,
        body: caption,
        caption,
        media_url: mediaUrlToSave,
        status: statusPayload.status,
        tags: parseTags(tagsInput),
        integrationId: formData.integrationId || null,
        integrationKind: selectedIntegration?.settings?.kind || null,
        integrationProvider: selectedIntegration?.provider || null,
        platform: primaryPlatform,
        scheduledDate,
        publishedDate: chosenStatus === "DONE" ? new Date().toISOString() : null,
        metadata: {
          ...(statusPayload.metadata || {}),
          scheduleSlots: cleanedSlots,
          postKind: primaryPostKind,
          postKinds: normalizedPostKinds,
          platforms: selectedPlatformsValue,
          ...(recurrencePayload ? { recurrence: recurrencePayload } : {}),
          ...(recurrencePayload && normalizedPostKinds.includes("story")
            ? { storySchedule: recurrencePayload }
            : {}),
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
  const statusMeta = STATUS_PREVIEW[formData.status] || STATUS_PREVIEW.DRAFT;
  const previewClientInitials = selectedClient?.name
    ? selectedClient.name.trim().slice(0, 2).toUpperCase()
    : "KS";
  const previewIntegrationLabel = selectedIntegration
    ? resolveIntegrationLabel(selectedIntegration)
    : "Rede principal";
  const previewPlatforms = selectedPlatforms.length ? selectedPlatforms : [];
  const previewPostKinds = selectedPostKinds.length ? selectedPostKinds : [];
  const primarySlot =
    scheduleSlots.find((slot) => slot.date || slot.time) || null;
  const scheduleLabel = recurrence.enabled
    ? generatedRecurringSlots.length
      ? `Recorrente (${generatedRecurringSlots.length} posts)`
      : "Recorrente (defina dias)"
    : primarySlot?.date
    ? formatSlotLabel(primarySlot)
    : "Sem agendamento";
  const previewTags = parseTags(tagsInput);

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
          <div className="lg:col-span-2">
            <div className="rounded-[18px] border border-[var(--border)] bg-[linear-gradient(120deg,rgba(255,255,255,0.96),rgba(109,40,217,0.06))] p-4 shadow-[var(--shadow-sm)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Fluxo do post
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    Seis etapas claras para criar, revisar e publicar.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[10px] font-semibold text-[var(--primary)] shadow-[var(--shadow-sm)]">
                  <Sparkles className="h-3 w-3" />
                  IA ATIVA
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {FLOW_STEPS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToStep(item.id)}
                    className="group flex w-full items-center gap-3 rounded-[14px] border border-[var(--border)] bg-white px-3 py-2 text-left text-xs shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-muted)] text-xs font-semibold text-[var(--text)] transition group-hover:bg-[var(--primary-light)] group-hover:text-[var(--primary)]">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[var(--text)]">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {item.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <StepCard
              id="post-step-1"
              step="1"
              title="Selecione perfis"
              subtitle="Escolha o perfil e um grupo (opcional)."
            >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <Label>Perfil</Label>
                    <SelectNative
                      value={formData.clientId}
                      onChange={handleChange("clientId")}
                    >
                      <option value="">Selecione um cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </SelectNative>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="self-end">
                    Selecionar um grupo
                  </Button>
                </div>
            </StepCard>

              <StepCard
                id="post-step-2"
                step="2"
                title="Selecione canais"
                subtitle="Escolha redes e tipos de post."
              >
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>Rede social</Label>
                    <SelectNative
                      value={formData.integrationId}
                      onChange={handleChange("integrationId")}
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
                    </SelectNative>
                    {formData.clientId && postingIntegrations.length === 0 ? (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-600">
                        <span>Cadastre uma integracao deste cliente antes de publicar.</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== "undefined") {
                              window.location.href = "/integrations";
                            }
                          }}
                          className="font-semibold underline-offset-2 hover:underline"
                        >
                          Ir para Integracoes
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Canal</Label>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Multi-selecao
                      </span>
                    </div>
                    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-2">
                      {platformOptions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {platformOptions.map((opt) => {
                            const active = selectedPlatforms.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => togglePlatform(opt.value)}
                                className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-semibold transition ${
                                  active
                                    ? "border-[var(--primary)] bg-white text-[var(--primary)] shadow-[var(--shadow-sm)]"
                                    : "border-[var(--border)] text-[var(--text-muted)] hover:bg-white"
                                }`}
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor:
                                      PLATFORM_COLOR_MAP[opt.value] || "var(--primary)",
                                  }}
                                />
                                <span>{opt.label}</span>
                                {active ? <Check className="h-3 w-3" /> : null}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-2 py-2 text-xs text-[var(--text-muted)]">
                          Selecione uma rede para ver os canais.
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Selecione mais de um canal para publicar o mesmo conteudo.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Tipo de post</Label>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Multi-selecao
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {POST_KIND_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = selectedPostKinds.includes(option.value);
                      const helperText =
                        option.value === "story"
                          ? "Publicacao rapida"
                          : option.value === "reel"
                          ? "Video curto"
                          : "Feed principal";
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => togglePostKind(option.value)}
                          className={`flex items-center justify-between rounded-[12px] border px-3 py-2 text-left text-xs font-semibold transition ${
                            active
                              ? "border-[var(--primary)] bg-white shadow-[var(--shadow-sm)]"
                              : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${
                                active
                                  ? "bg-[var(--primary-light)] text-[var(--primary)]"
                                  : "bg-white text-[var(--text-muted)] border border-[var(--border)]"
                              }`}
                            >
                              {Icon ? <Icon className="h-4 w-4" /> : null}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-[var(--text)]">
                                {option.label}
                              </p>
                              <p className="text-[10px] text-[var(--text-muted)]">
                                {helperText}
                              </p>
                            </div>
                          </div>
                          {active ? <Check className="h-4 w-4 text-[var(--primary)]" /> : null}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Combine tipos para distribuir o mesmo conteudo em varios formatos.
                  </p>
                </div>
              </StepCard>

              <StepCard
                id="post-step-3"
                step="3"
                title="Texto do post"
                subtitle="Legenda, hashtags e IA para acelerar."
                badge={
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-light)] px-2 py-1 text-[10px] font-semibold text-[var(--primary)]">
                    <Sparkles className="h-3 w-3" />
                    IA
                  </span>
                }
              >
                <div className="rounded-[14px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(109,40,217,0.08))] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[var(--primary)] shadow-[var(--shadow-sm)]">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">
                          Kondor IA
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Gere legendas e variacoes com tom premium.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={Sparkles}
                      onClick={() => setShowAiHelper((prev) => !prev)}
                    >
                      Gerar com IA
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[10px] font-semibold text-[var(--text)]">
                      CTA inteligente
                    </span>
                    <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[10px] font-semibold text-[var(--text)]">
                      Tom premium
                    </span>
                    <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[10px] font-semibold text-[var(--text)]">
                      Hashtags sugeridas
                    </span>
                  </div>
                  {showAiHelper ? (
                    <div className="mt-3 rounded-[12px] border border-[var(--border)] bg-white/80 px-3 py-2 text-xs text-[var(--text-muted)]">
                      Ajuste o contexto do post para gerar legendas com IA (em breve).
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center rounded-[10px] border border-[var(--border)] bg-white p-1">
                    <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      Tom
                    </span>
                    <button
                      type="button"
                      className="h-8 rounded-[8px] px-3 text-xs font-semibold text-[var(--primary)] bg-[var(--primary-light)]"
                    >
                      Todos
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    IA segue o tom selecionado.
                  </p>
                </div>

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
                id="post-step-4"
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
                        <p>Nenhuma midia selecionada.</p>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--text)] shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                        >
                          Selecionar midia
                        </button>
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
                id="post-step-5"
                step="5"
                title="Data e horario das publicacoes"
                subtitle="Defina a data e configure repeticoes."
              >
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                    <div className="space-y-2">
                      <Label>{recurrence.enabled ? "Data de inicio" : "Data"}</Label>
                      <DateField
                        className="w-full"
                        value={
                          recurrence.enabled
                            ? recurrence.startDate
                            : scheduleSlots[0]?.date || ""
                        }
                        onChange={handlePrimaryDateChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Horario</Label>
                      <TimeField
                        value={
                          recurrence.enabled
                            ? recurrence.time
                            : scheduleSlots[0]?.time || ""
                        }
                        onChange={handlePrimaryTimeChange}
                      />
                    </div>
                  </div>

                  <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[var(--primary)] shadow-[var(--shadow-sm)]">
                          <Repeat className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            Repetir publicacao
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            Defina dias e periodo para repetir o agendamento.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={recurrence.enabled}
                          onCheckedChange={toggleRecurrence}
                        />
                        <span className="text-xs text-[var(--text-muted)]">
                          {recurrence.enabled ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>

                    {recurrence.enabled ? (
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                          <div className="space-y-2">
                            <Label>Data final</Label>
                            <DateField
                              value={recurrence.endDate}
                              onChange={(event) =>
                                updateRecurrenceField("endDate", event.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Dias da semana</Label>
                            <div className="flex flex-wrap gap-2">
                              {WEEKDAY_OPTIONS.map((day) => (
                                <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => toggleRecurrenceWeekday(day.value)}
                                  className={`rounded-[10px] border px-3 py-2 text-xs font-semibold transition ${
                                    recurrence.weekdays.includes(day.value)
                                      ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                                  }`}
                                >
                                  {day.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-[var(--text-muted)]">
                            {generatedRecurringSlots.length
                              ? `Serão agendados ${generatedRecurringSlots.length} posts neste periodo.`
                              : "Selecione um periodo e dias para gerar os horarios."}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            leftIcon={showGeneratedSlots ? ChevronUp : ChevronDown}
                            onClick={() => setShowGeneratedSlots((prev) => !prev)}
                          >
                            {showGeneratedSlots ? "Ocultar horarios" : "Ver horarios gerados"}
                          </Button>
                        </div>

                        {showGeneratedSlots ? (
                          <div className="max-h-40 overflow-auto rounded-[12px] border border-[var(--border)] bg-white p-3">
                            <div className="flex flex-wrap gap-2">
                              {generatedRecurringSlots.map((slot) => (
                                <span
                                  key={`slot-${slot.date}-${slot.time}`}
                                  className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[11px] text-[var(--text-muted)]"
                                >
                                  {formatSlotLabel(slot)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </StepCard>

              <StepCard
                id="post-step-6"
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
                    <p className="text-sm font-semibold text-[var(--text)]">
                      Preview inteligente
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Atualiza em tempo real conforme voce preenche.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text)]">
                      Live
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--primary)]"
                    >
                      Ver todos
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[12px] border border-[var(--border)] bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Canais
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {previewPlatforms.length ? (
                        previewPlatforms.map((platform) => (
                          <span
                            key={`preview-platform-${platform}`}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--text)]"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor:
                                  PLATFORM_COLOR_MAP[platform] || "var(--primary)",
                              }}
                            />
                            {PLATFORM_LABELS[platform] || platform}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Selecione um canal
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[12px] border border-[var(--border)] bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Tipos
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {previewPostKinds.length ? (
                        previewPostKinds.map((kind) => (
                          <span
                            key={`preview-kind-${kind}`}
                            className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--text)]"
                          >
                            {POST_KIND_LABELS[kind] || kind}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Selecione um tipo
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[12px] border border-[var(--border)] bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Agendamento
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--text)]">
                      <CalendarDays className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      <span>{scheduleLabel}</span>
                    </div>
                  </div>

                  <div className="rounded-[12px] border border-[var(--border)] bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Status
                    </p>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-[16px] border border-[var(--border)] bg-white">
                  <div className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-xs font-semibold text-[var(--primary)]">
                      {previewClientInitials}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--text)]">
                        {selectedClient?.name || "Perfil selecionado"}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {previewIntegrationLabel}
                      </p>
                    </div>
                  </div>

                  <div className="aspect-square bg-[var(--surface-muted)]">
                    {effectivePreview ? (
                      formData.media_type === "video" ? (
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
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
                        Preview indisponivel
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 px-3 py-3">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {formData.title || "Titulo do post"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-3">
                      {buildCaption() || "A legenda do post aparece aqui."}
                    </p>
                    {previewTags.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {previewTags.slice(0, 6).map((tag, index) => (
                          <span
                            key={`preview-tag-${tag}-${index}`}
                            className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>
          </div>

        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-[var(--border)] bg-white px-6 py-4">
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

          <div className="flex flex-wrap items-start gap-6">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Salvar
              </p>
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
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Destino do post
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  leftIcon={CheckCircle2}
                  onClick={() => submitPost("CLIENT_APPROVAL")}
                  disabled={isSaving || isUploading || isDeleting}
                >
                  Enviar para aprovacao
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  leftIcon={Play}
                  onClick={() => submitPost("DONE")}
                  disabled={isSaving || isUploading || isDeleting}
                >
                  Publicar agora
                </Button>
                <Button
                  type="button"
                  leftIcon={CalendarDays}
                  onClick={() => submitPost("SCHEDULED")}
                  disabled={isSaving || isUploading || isDeleting}
                >
                  {isSaving ? "Salvando..." : "Agendar publicacao"}
                </Button>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                Aprovacao envia para o cliente. Agendar publica automaticamente.
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                Obs: o agendamento pode levar ate 1 minuto apos o horario para publicar.
              </p>
            </div>
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
