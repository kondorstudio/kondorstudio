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
    accent: "bg-blue-50 text-blue-600 border-blue-100",
  },
  META_SOCIAL: {
    label: "Meta Social",
    icon: Instagram,
    accent: "bg-pink-50 text-pink-600 border-pink-100",
  },
  GOOGLE_ADS: {
    label: "Google Ads",
    icon: Megaphone,
    accent: "bg-amber-50 text-amber-700 border-amber-100",
  },
  GA4: {
    label: "GA4",
    icon: BarChart3,
    accent: "bg-orange-50 text-orange-600 border-orange-100",
  },
  TIKTOK_ADS: {
    label: "TikTok Ads",
    icon: Music,
    accent: "bg-slate-100 text-slate-700 border-slate-200",
  },
  LINKEDIN_ADS: {
    label: "LinkedIn Ads",
    icon: Linkedin,
    accent: "bg-sky-50 text-sky-700 border-sky-100",
  },
  GBP: {
    label: "Google Business",
    icon: MapPin,
    accent: "bg-emerald-50 text-emerald-700 border-emerald-100",
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
