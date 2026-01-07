import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  PenSquare,
  ShieldCheck,
  UserCheck,
  CalendarCheck2,
} from "lucide-react";

export const WORKFLOW_STATUS_ORDER = [
  "DRAFT",
  "CONTENT",
  "INTERNAL_APPROVAL",
  "CLIENT_APPROVAL",
  "CHANGES",
  "SCHEDULING",
  "SCHEDULED",
  "DONE",
];

export const WORKFLOW_STATUS_CONFIG = {
  DRAFT: {
    label: "Rascunho",
    icon: FileText,
    tone: "text-slate-500",
    badge: "bg-slate-100 text-slate-700",
    accent: "bg-slate-400",
    accentSoft: "bg-slate-50/70",
    border: "border-slate-200/80",
    description: "Ideias e conteudos iniciais.",
  },
  CONTENT: {
    label: "Conteudo",
    icon: PenSquare,
    tone: "text-sky-600",
    badge: "bg-sky-50 text-sky-700",
    accent: "bg-sky-500",
    accentSoft: "bg-sky-50/60",
    border: "border-sky-100/80",
    description: "Conteudos em producao.",
  },
  INTERNAL_APPROVAL: {
    label: "Aprovacao interna",
    icon: ShieldCheck,
    tone: "text-indigo-600",
    badge: "bg-indigo-50 text-indigo-700",
    accent: "bg-indigo-500",
    accentSoft: "bg-indigo-50/60",
    border: "border-indigo-100/80",
    description: "Revisao do time interno.",
  },
  CLIENT_APPROVAL: {
    label: "Aprovacao do cliente",
    icon: UserCheck,
    tone: "text-amber-600",
    badge: "bg-amber-50 text-amber-700",
    accent: "bg-amber-500",
    accentSoft: "bg-amber-50/60",
    border: "border-amber-100/80",
    description: "Aguardando validacao do cliente.",
  },
  CHANGES: {
    label: "Ajustes",
    icon: AlertTriangle,
    tone: "text-rose-600",
    badge: "bg-rose-50 text-rose-700",
    accent: "bg-rose-500",
    accentSoft: "bg-rose-50/60",
    border: "border-rose-100/80",
    description: "Pendencias ou correcoes solicitadas.",
  },
  SCHEDULING: {
    label: "Aguardando agendamento",
    icon: Clock,
    tone: "text-violet-600",
    badge: "bg-violet-50 text-violet-700",
    accent: "bg-violet-500",
    accentSoft: "bg-violet-50/60",
    border: "border-violet-100/80",
    description: "Aprovados aguardando agenda.",
  },
  SCHEDULED: {
    label: "Aprovado e agendado",
    icon: CalendarCheck2,
    tone: "text-emerald-600",
    badge: "bg-emerald-50 text-emerald-700",
    accent: "bg-emerald-500",
    accentSoft: "bg-emerald-50/60",
    border: "border-emerald-100/80",
    description: "Postagens ja programadas.",
  },
  DONE: {
    label: "Concluidos",
    icon: CheckCircle2,
    tone: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-800",
    accent: "bg-emerald-600",
    accentSoft: "bg-emerald-100/60",
    border: "border-emerald-200/80",
    description: "Publicados ou finalizados.",
  },
};

const WORKFLOW_TO_POST_STATUS = {
  DRAFT: "DRAFT",
  CONTENT: "IDEA",
  INTERNAL_APPROVAL: "IDEA",
  CLIENT_APPROVAL: "PENDING_APPROVAL",
  CHANGES: "DRAFT",
  SCHEDULING: "APPROVED",
  SCHEDULED: "SCHEDULED",
  DONE: "PUBLISHED",
};

const LEGACY_STATUS_ALIASES = {
  IDEA: "CONTENT",
  PRODUCTION: "CONTENT",
  EDITING: "INTERNAL_APPROVAL",
  PENDING_APPROVAL: "CLIENT_APPROVAL",
  APPROVED: "SCHEDULING",
  SCHEDULED: "SCHEDULED",
  PUBLISHED: "DONE",
  ARCHIVED: "DONE",
  FAILED: "DONE",
  CANCELLED: "DONE",
};

export function normalizeWorkflowStatus(value) {
  if (!value) return null;
  const raw = String(value).trim().replace(/\s+/g, "_").toUpperCase();
  if (WORKFLOW_STATUS_CONFIG[raw]) return raw;
  if (LEGACY_STATUS_ALIASES[raw]) return LEGACY_STATUS_ALIASES[raw];
  return null;
}

export function resolveWorkflowStatus(post) {
  const explicit = normalizeWorkflowStatus(post?.metadata?.workflowStatus);
  if (explicit) return explicit;

  const base = normalizeWorkflowStatus(post?.status);
  if (base === "DRAFT") {
    const feedback = (post?.clientFeedback || post?.client_feedback || "").trim();
    return feedback ? "CHANGES" : "DRAFT";
  }

  return base || "DRAFT";
}

export function getWorkflowStatusConfig(status) {
  const key = normalizeWorkflowStatus(status) || "DRAFT";
  return WORKFLOW_STATUS_CONFIG[key] || WORKFLOW_STATUS_CONFIG.DRAFT;
}

export function mapWorkflowToPostStatus(status) {
  const key = normalizeWorkflowStatus(status) || "DRAFT";
  return WORKFLOW_TO_POST_STATUS[key] || "DRAFT";
}

export function buildStatusPayload(status) {
  const normalized = normalizeWorkflowStatus(status) || "DRAFT";
  return {
    status: mapWorkflowToPostStatus(normalized),
    workflowStatus: normalized,
    metadata: { workflowStatus: normalized },
  };
}

export function isClientApprovalStatus(status) {
  return normalizeWorkflowStatus(status) === "CLIENT_APPROVAL";
}

export function getWorkflowStatuses() {
  return WORKFLOW_STATUS_ORDER.map((key) => ({
    key,
    ...WORKFLOW_STATUS_CONFIG[key],
  }));
}
