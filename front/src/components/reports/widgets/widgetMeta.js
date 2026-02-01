import {
  BarChart3,
  LineChart,
  PieChart,
  Table2,
  Type,
  Image as ImageIcon,
  Megaphone,
  Music,
  Facebook,
  Instagram,
  Linkedin,
  MapPin,
} from "lucide-react";

export const WIDGET_TYPE_META = {
  KPI: { label: "KPI", icon: BarChart3 },
  LINE: { label: "Linha", icon: LineChart },
  BAR: { label: "Barra", icon: BarChart3 },
  PIE: { label: "Pizza", icon: PieChart },
  TABLE: { label: "Tabela", icon: Table2 },
  TEXT: { label: "Texto", icon: Type },
  IMAGE: { label: "Imagem", icon: ImageIcon },
};

export const SOURCE_META = {
  META_ADS: {
    label: "Meta Ads",
    icon: Facebook,
    accent: "bg-blue-50/40 text-blue-700 border-blue-200",
  },
  META_SOCIAL: {
    label: "Facebook/Instagram",
    icon: Instagram,
    accent: "bg-pink-50/40 text-pink-700 border-pink-200",
  },
  GOOGLE_ADS: {
    label: "Google Ads",
    icon: Megaphone,
    accent: "bg-amber-50/40 text-amber-700 border-amber-200",
  },
  GA4: {
    label: "Google Analytics 4",
    icon: BarChart3,
    accent: "bg-orange-50/40 text-orange-700 border-orange-200",
  },
  TIKTOK_ADS: {
    label: "TikTok Ads",
    icon: Music,
    accent: "bg-slate-50 text-slate-700 border-slate-200",
  },
  LINKEDIN_ADS: {
    label: "LinkedIn Ads",
    icon: Linkedin,
    accent: "bg-sky-50/40 text-sky-700 border-sky-200",
  },
  GBP: {
    label: "Google Meu Negocio",
    icon: MapPin,
    accent: "bg-emerald-50/40 text-emerald-700 border-emerald-200",
  },
};

export function getWidgetTypeMeta(type) {
  if (!type) return WIDGET_TYPE_META.KPI;
  return WIDGET_TYPE_META[type] || WIDGET_TYPE_META.KPI;
}

export function getSourceMeta(source) {
  if (!source) return null;
  return SOURCE_META[source] || null;
}
