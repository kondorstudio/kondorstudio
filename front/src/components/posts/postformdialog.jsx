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
  Facebook,
  Instagram,
  Linkedin,
  Music,
  Image as ImageIcon,
  Play,
  Repeat,
  Sparkles,
  Twitter,
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
];

const NETWORK_DEFINITIONS = [
  {
    key: "instagram",
    label: "Instagram",
    icon: Instagram,
    formats: [
      { value: "feed", label: "Feed" },
      { value: "story", label: "Stories" },
      { value: "reel", label: "Reels" },
    ],
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: Facebook,
    formats: [
      { value: "feed", label: "Feed" },
      { value: "story", label: "Stories" },
      { value: "reel", label: "Reels" },
    ],
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: Music,
    formats: [{ value: "reel", label: "Video" }],
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    formats: [
      { value: "feed", label: "Feed" },
      { value: "reel", label: "Video" },
    ],
    disabled: true,
  },
  {
    key: "x",
    label: "X (Twitter)",
    icon: Twitter,
    formats: [{ value: "feed", label: "Post" }],
    disabled: true,
  },
];
const STATUS_PREVIEW = {
  DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  CLIENT_APPROVAL: {
    label: "Em aprovacao",
    className: "bg-purple-100 text-purple-700",
  },
  DONE: { label: "Publicado", className: "bg-emerald-100 text-emerald-700" },
  PUBLISHING: { label: "Publicando", className: "bg-violet-100 text-violet-700" },
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
  onDeleteLocal,
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
  const [scheduleSlots, setScheduleSlots] = useState([{ date: "", time: "" }]);
  const [recurrence, setRecurrence] = useState(normalizeRecurrence(null));
  const [showGeneratedSlots, setShowGeneratedSlots] = useState(false);
  const [selectedNetworks, setSelectedNetworks] = useState([]);
  const [selectedAccountsByNetwork, setSelectedAccountsByNetwork] = useState({});
  const [selectedFormatsByNetwork, setSelectedFormatsByNetwork] = useState({});
  const [networkError, setNetworkError] = useState("");
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
    setScheduleSlots(sortScheduleSlots(nextSlots));
    setRecurrence(normalizedRecurrence);
    setShowGeneratedSlots(false);
    const initialPlatforms = normalizePlatforms(payload.platforms);
    const initialNetworks = initialPlatforms.filter((platform) =>
      networkDefinitionsByKey.has(platform)
    );
    setSelectedNetworks(initialNetworks);
    const nextFormatsByNetwork = {};
    initialNetworks.forEach((network) => {
      const def = networkDefinitionsByKey.get(network);
      const allowed = def ? def.formats.map((item) => item.value) : [];
      const selected = nextPostKinds.filter((kind) => allowed.includes(kind));
      nextFormatsByNetwork[network] = selected.length ? selected : allowed;
    });
    setSelectedFormatsByNetwork(nextFormatsByNetwork);
    const nextAccounts = {};
    if (payload.integrationId) {
      const platformAccounts = metadata.platformAccounts || {};
      initialNetworks.forEach((network) => {
        nextAccounts[network] = {
          integrationId: payload.integrationId,
          accountId: platformAccounts[network] || null,
        };
      });
    }
    setSelectedAccountsByNetwork(nextAccounts);
    setNetworkError("");
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
      if (kind === "meta_business") return true;
      if (kind === "tiktok") return true;
      if (integration.provider === "TIKTOK") return true;
      return false;
    });
  }, [clientIntegrations]);

  const integrationsById = React.useMemo(() => {
    const map = new Map();
    postingIntegrations.forEach((integration) => {
      map.set(integration.id, integration);
    });
    return map;
  }, [postingIntegrations]);

  const networkAccounts = React.useMemo(() => {
    const base = {
      instagram: [],
      facebook: [],
      tiktok: [],
      linkedin: [],
      x: [],
    };

    postingIntegrations.forEach((integration) => {
      const kind = integration.settings?.kind || "";
      if (kind === "meta_business") {
        const settings = integration.settings || {};
        const configAccounts = Array.isArray(integration.config?.accounts)
          ? integration.config.accounts
          : [];
        const pageId = settings.pageId || settings.page_id || null;
        const igBusinessId = settings.igBusinessId || settings.ig_business_id || null;
        const pageMeta = configAccounts.find((acc) => acc?.pageId === pageId) || null;
        const igMeta =
          configAccounts.find((acc) => acc?.igBusinessAccountId === igBusinessId) || null;

        if (igBusinessId) {
          base.instagram.push({
            integrationId: integration.id,
            accountId: igBusinessId,
            label: igMeta?.igUsername ? `@${igMeta.igUsername}` : `Instagram ${igBusinessId.slice(-4)}`,
            status: integration.status,
          });
        }

        if (pageId) {
          base.facebook.push({
            integrationId: integration.id,
            accountId: pageId,
            label: pageMeta?.pageName || `Página ${pageId.slice(-4)}`,
            status: integration.status,
          });
        }
      }

      if (kind === "tiktok" || integration.provider === "TIKTOK") {
        const settings = integration.settings || {};
        base.tiktok.push({
          integrationId: integration.id,
          accountId: integration.id,
          label: settings.username || settings.handle || integration.providerName || "Conta TikTok",
          status: integration.status,
        });
      }
    });

    return base;
  }, [postingIntegrations]);

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
  const networkDefinitionsByKey = React.useMemo(() => {
    const map = new Map();
    NETWORK_DEFINITIONS.forEach((network) => {
      map.set(network.key, network);
    });
    return map;
  }, []);
  const generatedRecurringSlots = React.useMemo(() => {
    if (!recurrence.enabled) return [];
    return sortScheduleSlots(buildRecurringScheduleSlots(recurrence));
  }, [recurrence]);

  const resolveIntegrationLabel = (integration) => {
    if (!integration) return "Selecione uma rede";
    const kind = integration.settings?.kind;
    if (kind === "meta_business") return "Meta Business (Facebook/Instagram)";
    if (kind === "tiktok") return "TikTok";
    return integration.providerName || integration.provider || "Integração";
  };

  const resolvePlatformValue = (integration) => {
    if (!integration) return null;
    const kind = integration.settings?.kind;
    if (kind === "tiktok") return "tiktok";
    if (kind === "meta_business") return "meta_business";
    return integration.provider || null;
  };

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

  useEffect(() => {
    if (!formData.clientId) {
      setSelectedNetworks([]);
      setSelectedAccountsByNetwork({});
      setSelectedFormatsByNetwork({});
      setNetworkError("");
    }
  }, [formData.clientId]);

  const activeIntegrationId = React.useMemo(() => {
    const ids = Object.values(selectedAccountsByNetwork || {})
      .map((item) => item?.integrationId)
      .filter(Boolean);
    const unique = Array.from(new Set(ids));
    return unique.length === 1 ? unique[0] : "";
  }, [selectedAccountsByNetwork]);

  const hasIntegrationConflict = React.useMemo(() => {
    const ids = Object.values(selectedAccountsByNetwork || {})
      .map((item) => item?.integrationId)
      .filter(Boolean);
    return new Set(ids).size > 1;
  }, [selectedAccountsByNetwork]);

  useEffect(() => {
    setFormData((prev) => {
      const nextPlatforms = selectedNetworks
        .filter((network) => selectedAccountsByNetwork[network]?.integrationId)
        .map((network) => network);
      if (areArraysEqual(normalizePlatforms(prev.platforms), nextPlatforms)) return prev;
      return { ...prev, platforms: nextPlatforms };
    });
  }, [selectedNetworks, selectedAccountsByNetwork]);

  useEffect(() => {
    setFormData((prev) => {
      const selectedFormats = Object.values(selectedFormatsByNetwork || {}).flat();
      const unique = Array.from(new Set(selectedFormats)).filter(Boolean);
      if (areArraysEqual(normalizePostKinds(prev.postKinds), unique)) return prev;
      return { ...prev, postKinds: unique };
    });
  }, [selectedFormatsByNetwork]);

  useEffect(() => {
    if (hasIntegrationConflict) return;
    setFormData((prev) => {
      if (prev.integrationId === activeIntegrationId) return prev;
      return { ...prev, integrationId: activeIntegrationId || "" };
    });
  }, [activeIntegrationId, hasIntegrationConflict]);

  const handleToggleNetwork = (networkKey) => {
    setNetworkError("");
    if (!formData.clientId) {
      setNetworkError("Selecione um cliente antes de escolher as redes.");
      return;
    }
    const isSelectedNow = selectedNetworks.includes(networkKey);
    setSelectedNetworks((prev) => {
      const isSelected = prev.includes(networkKey);
      return isSelected
        ? prev.filter((item) => item !== networkKey)
        : [...prev, networkKey];
    });

    if (!isSelectedNow) {
      const accounts = networkAccounts[networkKey] || [];
      if (accounts.length && !selectedAccountsByNetwork[networkKey]?.integrationId) {
        handleSelectAccount(networkKey, accounts[0]);
      }
      const def = networkDefinitionsByKey.get(networkKey);
      const allowed = def ? def.formats.map((item) => item.value) : [];
      if (allowed.length && !selectedFormatsByNetwork[networkKey]?.length) {
        setSelectedFormatsByNetwork((prev) => ({
          ...prev,
          [networkKey]: allowed,
        }));
      }
    } else {
      setSelectedAccountsByNetwork((prev) => {
        const next = { ...prev };
        delete next[networkKey];
        return next;
      });
      setSelectedFormatsByNetwork((prev) => {
        const next = { ...prev };
        delete next[networkKey];
        return next;
      });
    }
  };

  const handleSelectAccount = (networkKey, account) => {
    setNetworkError("");
    setSelectedAccountsByNetwork((prev) => ({
      ...prev,
      [networkKey]: account,
    }));
  };

  const handleToggleFormat = (networkKey, formatValue) => {
    setSelectedFormatsByNetwork((prev) => {
      const current = Array.isArray(prev[networkKey]) ? prev[networkKey] : [];
      const next = current.includes(formatValue)
        ? current.filter((item) => item !== formatValue)
        : [...current, formatValue];
      return { ...prev, [networkKey]: next };
    });
  };


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

  const buildCaption = () => {
    const base = formData.body || "";
    const tags = parseTags(tagsInput).join(" ");
    const parts = [];
    if (base) parts.push(base);
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
    if (selectedNetworks.length === 0) {
      alert("Selecione ao menos uma rede social para publicar.");
      return;
    }
    const selectedPlatformsValue = normalizePlatforms(formData.platforms);
    if (selectedNetworks.length > 0 && selectedPlatformsValue.length === 0) {
      alert("Selecione uma conta conectada para cada rede.");
      return;
    }
    const missingAccounts = selectedNetworks.filter(
      (network) => !selectedAccountsByNetwork[network]?.integrationId
    );
    if (missingAccounts.length > 0) {
      alert("Selecione uma conta conectada para cada rede.");
      return;
    }
    const networkFormatsMap = {};
    for (const network of selectedNetworks) {
      const def = networkDefinitionsByKey.get(network);
      const allowedFormats = def ? def.formats.map((item) => item.value) : [];
      const selectedFormats = Array.isArray(selectedFormatsByNetwork[network])
        ? selectedFormatsByNetwork[network].filter((item) =>
            allowedFormats.includes(item)
          )
        : [];
      networkFormatsMap[network] = selectedFormats.length
        ? selectedFormats
        : allowedFormats;
      if (networkFormatsMap[network].length === 0) {
        alert("Selecione ao menos um formato para cada rede.");
        return;
      }
    }

    const allSelectedFormats = Array.from(
      new Set(Object.values(networkFormatsMap).flat())
    );
    const primaryPostKind = allSelectedFormats[0] || DEFAULT_POST_KIND;
    const recurringSlots = recurrence.enabled
      ? buildRecurringScheduleSlots(recurrence)
      : [];
    const cleanedSlots = sortScheduleSlots(
      normalizeScheduleSlots(recurringSlots.length ? recurringSlots : scheduleSlots)
    );
    const primarySlot = cleanedSlots.find((slot) => slot.date) || null;
    let scheduledDate = primarySlot
      ? buildScheduleDate(primarySlot.date, primarySlot.time)
      : null;

    if (recurrence.enabled && cleanedSlots.length === 0) {
      alert("Selecione os dias e o periodo para repetir o agendamento.");
      return;
    }

    const chosenStatus = statusOverride || formData.status || "DRAFT";
    if (chosenStatus === "PUBLISHING" && !scheduledDate) {
      scheduledDate = new Date().toISOString();
    }
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

      const platformAccounts = {};
      Object.entries(selectedAccountsByNetwork || {}).forEach(([network, account]) => {
        if (account?.accountId) {
          platformAccounts[network] = account.accountId;
        }
      });

      const trimmedTitle = formData.title ? formData.title.trim() : "";
      const fallbackTitle = trimmedTitle
        ? trimmedTitle
        : caption
        ? caption.split("\n")[0].slice(0, 60)
        : "Post sem titulo";

      const payloads = [];
      selectedNetworks.forEach((network) => {
        const account = selectedAccountsByNetwork[network];
        if (!account?.integrationId) return null;
        const formats = networkFormatsMap[network] || [];
        const integration = integrationsById.get(account.integrationId) || null;
        const perNetworkAccounts =
          platformAccounts && platformAccounts[network]
            ? { [network]: platformAccounts[network] }
            : {};
        formats.forEach((format) => {
          const perNetworkMetadata = {
            ...(statusPayload.metadata || {}),
            scheduleSlots: cleanedSlots,
            postKind: format,
            postKinds: [format],
            platforms: [network],
            ...(Object.keys(perNetworkAccounts).length
              ? { platformAccounts: perNetworkAccounts }
              : {}),
            ...(recurrencePayload ? { recurrence: recurrencePayload } : {}),
            ...(recurrencePayload && format === "story"
              ? { storySchedule: recurrencePayload }
              : {}),
          };

          payloads.push({
            ...formData,
            title: fallbackTitle,
            postKind: format,
            body: caption,
            caption,
            media_url: mediaUrlToSave,
            status: statusPayload.status,
            tags: parseTags(tagsInput),
            integrationId: account.integrationId,
            integrationKind: integration?.settings?.kind || null,
            integrationProvider: integration?.provider || null,
            platform: network,
            scheduledDate,
            publishedDate: chosenStatus === "DONE" ? new Date().toISOString() : null,
            metadata: perNetworkMetadata,
          });
        });
      });

      if (onSubmit) {
        for (const payload of payloads.filter(Boolean)) {
          await onSubmit(payload);
        }
      }
      if (onCancel) {
        onCancel();
      }
    } catch (error) {
      console.error("Erro ao salvar post:", error);
      const apiError = error?.data?.error || null;
      const apiDetail = error?.data?.detail || null;
      const isSessionError =
        Number(error?.status) === 401 ||
        /token n[aã]o fornecido/i.test(String(apiError || "")) ||
        /token inv[aá]lido|expirado/i.test(String(apiError || ""));

      let message = "Erro ao salvar post. Tente novamente.";
      if (isSessionError) {
        message = "Sua sessão expirou. Faça login novamente.";
      } else if (apiError && apiDetail && apiDetail !== apiError) {
        message = `${apiError}. ${apiDetail}`;
      } else if (apiError) {
        message = apiError;
      } else if (error?.message) {
        message = error.message;
      }
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
                <div className="space-y-4">
                  {networkError ? (
                    <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {networkError}
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    {NETWORK_DEFINITIONS.map((network) => {
                      const accounts = networkAccounts[network.key] || [];
                      const isSelected = selectedNetworks.includes(network.key);
                      const hasAccounts = accounts.length > 0;
                      const hasError = accounts.some(
                        (acc) =>
                          String(acc?.status || "").toUpperCase() !== "CONNECTED"
                      );
                      const Icon = network.icon;
                      const selectedAccountId =
                        selectedAccountsByNetwork[network.key]?.accountId || "";
                      const selectedFormats = selectedFormatsByNetwork[network.key] || [];
                      const formatsLocked =
                        !selectedAccountsByNetwork[network.key]?.integrationId ||
                        hasError ||
                        network.disabled;

                      return (
                        <div
                          key={network.key}
                          className={`rounded-[14px] border bg-white p-4 shadow-[var(--shadow-sm)] transition ${
                            network.disabled
                              ? "border-dashed border-[var(--border)] opacity-50"
                              : isSelected
                              ? "border-[var(--primary)] bg-[var(--primary-light)]/30"
                              : "border-[var(--border)] hover:border-slate-300"
                          }`}
                        >
                          <div
                            role={network.disabled ? undefined : "button"}
                            tabIndex={network.disabled ? -1 : 0}
                            onClick={() =>
                              network.disabled ? null : handleToggleNetwork(network.key)
                            }
                            onKeyDown={(event) => {
                              if (network.disabled) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleToggleNetwork(network.key);
                              }
                            }}
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--surface-muted)] text-[var(--text)]">
                                {Icon ? <Icon className="h-5 w-5" /> : null}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-[var(--text)]">
                                  {network.label}
                                </p>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                  {hasAccounts
                                    ? `${accounts.length} conta${accounts.length > 1 ? "s" : ""} conectada${accounts.length > 1 ? "s" : ""}`
                                    : "Nenhuma conta conectada"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {hasError ? (
                                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">
                                  Reconectar
                                </span>
                              ) : null}
                              {isSelected ? (
                                <span className="rounded-full bg-[var(--primary)] px-2 py-1 text-[10px] font-semibold text-white">
                                  Selecionado
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {isSelected ? (
                            <div className="mt-4 space-y-3 animate-fade-in-up">
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-[var(--text)]">
                                  Conta
                                </p>
                                {hasAccounts ? (
                                  <div className="space-y-2">
                                    {accounts.map((account) => (
                                      <label
                                        key={`${network.key}-${account.accountId}`}
                                        className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-semibold ${
                                          selectedAccountId === account.accountId
                                            ? "border-[var(--primary)] bg-white"
                                            : "border-[var(--border)] text-[var(--text-muted)]"
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name={`account-${network.key}`}
                                          checked={selectedAccountId === account.accountId}
                                          onChange={() =>
                                            handleSelectAccount(network.key, account)
                                          }
                                          className="h-3.5 w-3.5"
                                        />
                                        <span>{account.label}</span>
                                      </label>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (typeof window !== "undefined") {
                                          window.location.href = "/integrations";
                                        }
                                      }}
                                      className="text-xs font-semibold text-[var(--primary)]"
                                    >
                                      + Conectar nova conta
                                    </button>
                                  </div>
                                ) : (
                                  <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
                                    Nenhuma conta conectada.
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (typeof window !== "undefined") {
                                          window.location.href = "/integrations";
                                        }
                                      }}
                                      className="ml-2 font-semibold text-[var(--primary)]"
                                    >
                                      Conectar conta
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-[var(--text)]">
                                  Formatos
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {network.formats.map((format) => {
                                    const active = selectedFormats.includes(format.value);
                                    return (
                                      <label
                                        key={`${network.key}-${format.value}`}
                                        className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-semibold ${
                                          active
                                            ? "border-[var(--primary)] bg-white text-[var(--primary)]"
                                            : "border-[var(--border)] text-[var(--text-muted)]"
                                        } ${formatsLocked ? "opacity-50" : ""}`}
                                      >
                                        <input
                                          type="checkbox"
                                          disabled={formatsLocked}
                                          checked={active}
                                          onChange={() =>
                                            handleToggleFormat(network.key, format.value)
                                          }
                                          className="h-3.5 w-3.5"
                                        />
                                        <span>{format.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </StepCard>

              <StepCard
                id="post-step-3"
                step="3"
                title="Texto do post"
                subtitle="Legenda e hashtags."
              >
                <Textarea
                  value={formData.body}
                  onChange={handleChange("body")}
                  placeholder="Digite o texto do post"
                  rows={6}
                />

                <div className="space-y-2">
                  <div className="space-y-2">
                    <Label>Hashtags</Label>
                    <Input
                      value={tagsInput}
                      onChange={(event) => setTagsInput(event.target.value)}
                      placeholder="#campanha #marca"
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2 rounded-[12px] border border-[var(--border)] bg-white p-3">
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
                    <div className="space-y-2 rounded-[12px] border border-[var(--border)] bg-white p-3">
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

                  <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
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

            </div>

            <aside className="space-y-4">
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (
                    !isDeleting &&
                    window.confirm("Excluir tambem na rede social?")
                  ) {
                    onDelete();
                  }
                }}
                disabled={isSaving || isUploading || isDeleting}
              >
                {isDeleting ? "Excluindo..." : "Excluir post (rede)"}
              </Button>
              {onDeleteLocal ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (
                      !isDeleting &&
                      window.confirm("Excluir apenas no Kondor?")
                    ) {
                      onDeleteLocal();
                    }
                  }}
                  disabled={isSaving || isUploading || isDeleting}
                >
                  Excluir so no Kondor
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.location.href = "/integrations";
                  }
                }}
              >
                Reconectar Meta
              </Button>
            </div>
          ) : (
            <div />
          )}

          <div className="flex flex-wrap items-start gap-6">
            <div className="space-y-2">
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
                  onClick={() => submitPost("PUBLISHING")}
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
