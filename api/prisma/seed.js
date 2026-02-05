
/* eslint-disable no-console */
// api/prisma/seed.js
// Seed idempotente para desenvolvimento/ambientes vazios.
//
// Cria:
// - Planos base (starter/pro/agencia) se não existirem
// - 1 tenant + 1 usuário ADMIN
// - (opcional) 1 usuário SUPER_ADMIN para o painel mestre
//
// Variáveis opcionais:
// - SEED_TENANT_NAME, SEED_TENANT_SLUG
// - SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
// - SEED_CREATE_SUPERADMIN=true|false
// - SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PASSWORD

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("../src/utils/hash");

const prisma = new PrismaClient();

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return String(raw).toLowerCase() === "true";
}

function requiredString(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return String(value);
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

const REPORT_TEMPLATE_SEEDS = [
  {
    name: "Kondor - Visao Geral (Meta Ads)",
    description: "KPIs principais e tendencia diaria para Meta Ads.",
    visibility: "TENANT",
    version: 1,
    layoutSchema: [
      { i: "w1", x: 0, y: 0, w: 4, h: 2 },
      { i: "w2", x: 4, y: 0, w: 4, h: 2 },
      { i: "w3", x: 8, y: 0, w: 4, h: 2 },
      { i: "w4", x: 0, y: 2, w: 12, h: 4 },
    ],
    widgetsSchema: [
      {
        id: "w1",
        widgetType: "KPI",
        title: "Impressions",
        source: "META_ADS",
        level: "CAMPAIGN",
        metrics: ["impressions"],
      },
      {
        id: "w2",
        widgetType: "KPI",
        title: "Clicks",
        source: "META_ADS",
        level: "CAMPAIGN",
        metrics: ["clicks"],
      },
      {
        id: "w3",
        widgetType: "KPI",
        title: "Spend",
        source: "META_ADS",
        level: "CAMPAIGN",
        metrics: ["spend"],
      },
      {
        id: "w4",
        widgetType: "LINE",
        title: "Impressions por dia",
        source: "META_ADS",
        level: "CAMPAIGN",
        breakdown: "date_start",
        metrics: ["impressions"],
      },
    ],
  },
  {
    name: "Kondor - Performance Campanhas (Google Ads)",
    description: "Visao de campanhas Google Ads com KPIs e tabela.",
    visibility: "TENANT",
    version: 1,
    layoutSchema: [
      { i: "w1", x: 0, y: 0, w: 4, h: 2 },
      { i: "w2", x: 4, y: 0, w: 4, h: 2 },
      { i: "w3", x: 8, y: 0, w: 4, h: 2 },
      { i: "w4", x: 0, y: 2, w: 12, h: 5 },
    ],
    widgetsSchema: [
      {
        id: "w1",
        widgetType: "KPI",
        title: "Impressions",
        source: "GOOGLE_ADS",
        level: "CAMPAIGN",
        metrics: ["metrics.impressions"],
      },
      {
        id: "w2",
        widgetType: "KPI",
        title: "Clicks",
        source: "GOOGLE_ADS",
        level: "CAMPAIGN",
        metrics: ["metrics.clicks"],
      },
      {
        id: "w3",
        widgetType: "KPI",
        title: "Cost",
        source: "GOOGLE_ADS",
        level: "CAMPAIGN",
        metrics: ["metrics.cost_micros"],
      },
      {
        id: "w4",
        widgetType: "TABLE",
        title: "Campanhas",
        source: "GOOGLE_ADS",
        level: "CAMPAIGN",
        breakdown: "campaign.id",
        metrics: ["metrics.impressions", "metrics.clicks", "metrics.cost_micros"],
      },
    ],
  },
  {
    name: "Kondor - Funil de Conversao (GA4)",
    description: "Resumo de audiencia e sessoes com tendencia.",
    visibility: "TENANT",
    version: 1,
    layoutSchema: [
      { i: "w1", x: 0, y: 0, w: 6, h: 2 },
      { i: "w2", x: 6, y: 0, w: 6, h: 2 },
      { i: "w3", x: 0, y: 2, w: 12, h: 4 },
    ],
    widgetsSchema: [
      {
        id: "w1",
        widgetType: "KPI",
        title: "Sessions",
        source: "GA4",
        level: "PROPERTY",
        metrics: ["sessions"],
      },
      {
        id: "w2",
        widgetType: "KPI",
        title: "Total Users",
        source: "GA4",
        level: "PROPERTY",
        metrics: ["totalUsers"],
      },
      {
        id: "w3",
        widgetType: "LINE",
        title: "Sessions por dia",
        source: "GA4",
        level: "PROPERTY",
        breakdown: "date",
        metrics: ["sessions"],
      },
    ],
  },
  {
    name: "Kondor - Social Growth (Meta Social)",
    description: "Crescimento social com foco em seguidores e impressao.",
    visibility: "TENANT",
    version: 1,
    layoutSchema: [
      { i: "w1", x: 0, y: 0, w: 4, h: 2 },
      { i: "w2", x: 4, y: 0, w: 4, h: 2 },
      { i: "w3", x: 8, y: 0, w: 4, h: 2 },
      { i: "w4", x: 0, y: 2, w: 12, h: 4 },
    ],
    widgetsSchema: [
      {
        id: "w1",
        widgetType: "KPI",
        title: "Followers",
        source: "META_SOCIAL",
        level: "ACCOUNT",
        metrics: ["followers"],
      },
      {
        id: "w2",
        widgetType: "KPI",
        title: "Impressions",
        source: "META_SOCIAL",
        level: "ACCOUNT",
        metrics: ["impressions"],
      },
      {
        id: "w3",
        widgetType: "KPI",
        title: "Engagements",
        source: "META_SOCIAL",
        level: "ACCOUNT",
        metrics: ["engagements"],
      },
      {
        id: "w4",
        widgetType: "LINE",
        title: "Impressions por dia",
        source: "META_SOCIAL",
        level: "ACCOUNT",
        breakdown: "date",
        metrics: ["impressions"],
      },
    ],
  },
  {
    name: "Kondor - Mix de Canais",
    description: "Visao multicanal com KPIs e tendencia.",
    visibility: "TENANT",
    version: 1,
    layoutSchema: [
      { i: "w1", x: 0, y: 0, w: 4, h: 2 },
      { i: "w2", x: 4, y: 0, w: 4, h: 2 },
      { i: "w3", x: 8, y: 0, w: 4, h: 2 },
      { i: "w4", x: 0, y: 2, w: 12, h: 4 },
    ],
    widgetsSchema: [
      {
        id: "w1",
        widgetType: "KPI",
        title: "GA4 Sessions",
        source: "GA4",
        level: "PROPERTY",
        metrics: ["sessions"],
      },
      {
        id: "w2",
        widgetType: "KPI",
        title: "Google Ads Clicks",
        source: "GOOGLE_ADS",
        level: "CAMPAIGN",
        metrics: ["metrics.clicks"],
      },
      {
        id: "w3",
        widgetType: "KPI",
        title: "Meta Ads Spend",
        source: "META_ADS",
        level: "CAMPAIGN",
        metrics: ["spend"],
      },
      {
        id: "w4",
        widgetType: "LINE",
        title: "Sessions por dia",
        source: "GA4",
        level: "PROPERTY",
        breakdown: "date",
        metrics: ["sessions"],
      },
    ],
  },
];

const METRIC_CATALOG_SEEDS = [
  {
    source: "META_ADS",
    level: "CAMPAIGN",
    metricKey: "impressions",
    label: "Impressions",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date_start"],
    isDefault: true,
  },
  {
    source: "META_ADS",
    level: "CAMPAIGN",
    metricKey: "clicks",
    label: "Clicks",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date_start"],
    isDefault: true,
  },
  {
    source: "META_ADS",
    level: "CAMPAIGN",
    metricKey: "spend",
    label: "Spend",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date_start"],
    isDefault: true,
  },
  {
    source: "META_ADS",
    level: "CAMPAIGN",
    metricKey: "date_start",
    dimensionKey: "date_start",
    label: "Date",
    type: "DIMENSION",
    supportedCharts: ["LINE", "TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "GOOGLE_ADS",
    level: "CAMPAIGN",
    metricKey: "metrics.impressions",
    label: "Impressions",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["segments.date", "campaign.id"],
    isDefault: true,
  },
  {
    source: "GOOGLE_ADS",
    level: "CAMPAIGN",
    metricKey: "metrics.clicks",
    label: "Clicks",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["segments.date", "campaign.id"],
    isDefault: true,
  },
  {
    source: "GOOGLE_ADS",
    level: "CAMPAIGN",
    metricKey: "metrics.cost_micros",
    label: "Cost (micros)",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["segments.date", "campaign.id"],
    isDefault: true,
  },
  {
    source: "GOOGLE_ADS",
    level: "CAMPAIGN",
    metricKey: "segments.date",
    dimensionKey: "segments.date",
    label: "Date",
    type: "DIMENSION",
    supportedCharts: ["LINE", "TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "GOOGLE_ADS",
    level: "CAMPAIGN",
    metricKey: "campaign.id",
    dimensionKey: "campaign.id",
    label: "Campaign",
    type: "DIMENSION",
    supportedCharts: ["TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "TIKTOK_ADS",
    level: "CAMPAIGN",
    metricKey: "impressions",
    label: "Impressions",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["stat_time_day"],
    isDefault: true,
  },
  {
    source: "TIKTOK_ADS",
    level: "CAMPAIGN",
    metricKey: "clicks",
    label: "Clicks",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["stat_time_day"],
    isDefault: true,
  },
  {
    source: "TIKTOK_ADS",
    level: "CAMPAIGN",
    metricKey: "spend",
    label: "Spend",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["stat_time_day"],
    isDefault: true,
  },
  {
    source: "TIKTOK_ADS",
    level: "CAMPAIGN",
    metricKey: "stat_time_day",
    dimensionKey: "stat_time_day",
    label: "Date",
    type: "DIMENSION",
    supportedCharts: ["LINE", "TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "LINKEDIN_ADS",
    level: "CAMPAIGN",
    metricKey: "impressions",
    label: "Impressions",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["dateRange"],
    isDefault: true,
  },
  {
    source: "LINKEDIN_ADS",
    level: "CAMPAIGN",
    metricKey: "clicks",
    label: "Clicks",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["dateRange"],
    isDefault: true,
  },
  {
    source: "LINKEDIN_ADS",
    level: "CAMPAIGN",
    metricKey: "costInLocalCurrency",
    label: "Cost",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["dateRange"],
    isDefault: true,
  },
  {
    source: "LINKEDIN_ADS",
    level: "CAMPAIGN",
    metricKey: "dateRange",
    dimensionKey: "dateRange",
    label: "Date",
    type: "DIMENSION",
    supportedCharts: ["LINE", "TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "GA4",
    level: "PROPERTY",
    metricKey: "sessions",
    label: "Sessions",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date", "sessionDefaultChannelGroup"],
    isDefault: true,
  },
  {
    source: "GA4",
    level: "PROPERTY",
    metricKey: "totalUsers",
    label: "Total Users",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date", "sessionDefaultChannelGroup"],
    isDefault: true,
  },
  {
    source: "GA4",
    level: "PROPERTY",
    metricKey: "date",
    dimensionKey: "date",
    label: "Date",
    type: "DIMENSION",
    supportedCharts: ["LINE", "TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "GA4",
    level: "PROPERTY",
    metricKey: "sessionDefaultChannelGroup",
    dimensionKey: "sessionDefaultChannelGroup",
    label: "Channel Group",
    type: "DIMENSION",
    supportedCharts: ["TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "GBP",
    level: "LOCATION",
    metricKey: "views",
    label: "Views",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date", "locationId"],
    isDefault: true,
  },
  {
    source: "GBP",
    level: "LOCATION",
    metricKey: "searches",
    label: "Searches",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date", "locationId"],
    isDefault: true,
  },
  {
    source: "GBP",
    level: "LOCATION",
    metricKey: "actions",
    label: "Actions",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date", "locationId"],
    isDefault: true,
  },
  {
    source: "GBP",
    level: "LOCATION",
    metricKey: "date",
    dimensionKey: "date",
    label: "Date",
    type: "DIMENSION",
    supportedCharts: ["LINE", "TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "GBP",
    level: "LOCATION",
    metricKey: "locationId",
    dimensionKey: "locationId",
    label: "Location",
    type: "DIMENSION",
    supportedCharts: ["TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
  {
    source: "META_SOCIAL",
    level: "ACCOUNT",
    metricKey: "followers",
    label: "Followers",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date"],
    isDefault: true,
  },
  {
    source: "META_SOCIAL",
    level: "ACCOUNT",
    metricKey: "impressions",
    label: "Impressions",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date"],
    isDefault: true,
  },
  {
    source: "META_SOCIAL",
    level: "ACCOUNT",
    metricKey: "engagements",
    label: "Engagements",
    type: "METRIC",
    supportedCharts: ["KPI", "LINE", "BAR"],
    supportedBreakdowns: ["date"],
    isDefault: true,
  },
  {
    source: "META_SOCIAL",
    level: "ACCOUNT",
    metricKey: "date",
    dimensionKey: "date",
    label: "Date",
    type: "DIMENSION",
    supportedCharts: ["LINE", "TABLE"],
    supportedBreakdowns: [],
    isDefault: false,
  },
];

const REPORT_TEMPLATES_V2_SEEDS = [
  {
    tenantId: null,
    name: "Kondor - Ads Overview",
    category: "Ads",
    layoutJson: {
      theme: {
        mode: "light",
        brandColor: "#B050F0",
        accentColor: "#22C55E",
        bg: "#FFFFFF",
        text: "#0F172A",
        mutedText: "#64748B",
        cardBg: "#FFFFFF",
        border: "#E2E8F0",
        radius: 16,
      },
      globalFilters: {
        dateRange: { preset: "last_30_days" },
        platforms: [],
        accounts: [],
        compareTo: null,
        autoRefreshSec: 0,
      },
      widgets: [
        {
          id: "a1111111-1111-4111-8111-111111111111",
          type: "kpi",
          title: "Spend",
          layout: { x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["spend"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a2222222-2222-4222-8222-222222222222",
          type: "kpi",
          title: "Impressions",
          layout: { x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["impressions"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a3333333-3333-4333-8333-333333333333",
          type: "kpi",
          title: "Clicks",
          layout: { x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["clicks"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a4444444-4444-4444-8444-444444444444",
          type: "kpi",
          title: "CTR",
          layout: { x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["ctr"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a5555555-5555-4555-8555-555555555555",
          type: "kpi",
          title: "Conversions",
          layout: { x: 0, y: 2, w: 3, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["conversions"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a6666666-6666-4666-8666-666666666666",
          type: "kpi",
          title: "CPA",
          layout: { x: 3, y: 2, w: 3, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["cpa"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a7777777-7777-4777-8777-777777777777",
          type: "kpi",
          title: "Revenue",
          layout: { x: 6, y: 2, w: 3, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["revenue"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a8888888-8888-4888-8888-888888888888",
          type: "kpi",
          title: "ROAS",
          layout: { x: 9, y: 2, w: 3, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["roas"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a9999999-9999-4999-8999-999999999999",
          type: "timeseries",
          title: "Spend ao longo do tempo",
          layout: { x: 0, y: 4, w: 12, h: 4, minW: 4, minH: 3 },
          query: { dimensions: ["date"], metrics: ["spend"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "a0a0a0a0-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          type: "bar",
          title: "Spend por plataforma",
          layout: { x: 0, y: 8, w: 6, h: 4, minW: 3, minH: 3 },
          query: { dimensions: ["platform"], metrics: ["spend"], filters: [] },
          viz: { variant: "default", showLegend: true, format: "auto", options: {} },
        },
        {
          id: "abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          type: "table",
          title: "Campanhas",
          layout: { x: 6, y: 8, w: 6, h: 4, minW: 3, minH: 3 },
          query: {
            dimensions: ["campaign_id"],
            metrics: ["spend", "conversions", "roas"],
            filters: [],
          },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
      ],
    },
  },
  {
    tenantId: null,
    name: "Kondor - GA4 Overview",
    category: "GA4",
    layoutJson: {
      theme: {
        mode: "light",
        brandColor: "#B050F0",
        accentColor: "#22C55E",
        bg: "#FFFFFF",
        text: "#0F172A",
        mutedText: "#64748B",
        cardBg: "#FFFFFF",
        border: "#E2E8F0",
        radius: 16,
      },
      globalFilters: {
        dateRange: { preset: "last_30_days" },
        platforms: ["GA4"],
        accounts: [],
        compareTo: null,
        autoRefreshSec: 0,
      },
      widgets: [
        {
          id: "b1111111-1111-4111-8111-111111111111",
          type: "kpi",
          title: "Sessions",
          layout: { x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["sessions"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "b2222222-2222-4222-8222-222222222222",
          type: "kpi",
          title: "Leads",
          layout: { x: 4, y: 0, w: 4, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["leads"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "b3333333-3333-4333-8333-333333333333",
          type: "kpi",
          title: "Conversions",
          layout: { x: 8, y: 0, w: 4, h: 2, minW: 2, minH: 2 },
          query: { dimensions: [], metrics: ["conversions"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "b4444444-4444-4444-8444-444444444444",
          type: "timeseries",
          title: "Sessions ao longo do tempo",
          layout: { x: 0, y: 2, w: 12, h: 4, minW: 4, minH: 3 },
          query: { dimensions: ["date"], metrics: ["sessions"], filters: [] },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
        {
          id: "b5555555-5555-4555-8555-555555555555",
          type: "table",
          title: "Campanhas",
          layout: { x: 0, y: 6, w: 12, h: 4, minW: 4, minH: 3 },
          query: {
            dimensions: ["campaign_id"],
            metrics: ["sessions", "conversions"],
            filters: [],
          },
          viz: { variant: "default", showLegend: false, format: "auto", options: {} },
        },
      ],
    },
  },
];

const METRICS_CATALOG_V2_SEEDS = [
  {
    key: "spend",
    label: "Spend",
    description: "Investimento total",
    format: "CURRENCY",
  },
  {
    key: "impressions",
    label: "Impressions",
    description: "Quantidade de impressões",
    format: "NUMBER",
  },
  {
    key: "clicks",
    label: "Clicks",
    description: "Quantidade de cliques",
    format: "NUMBER",
  },
  {
    key: "conversions",
    label: "Conversions",
    description: "Conversões atribuídas",
    format: "NUMBER",
  },
  {
    key: "revenue",
    label: "Revenue",
    description: "Receita atribuída",
    format: "CURRENCY",
  },
  {
    key: "sessions",
    label: "Sessions",
    description: "Sessões (GA4)",
    format: "NUMBER",
  },
  {
    key: "leads",
    label: "Leads",
    description: "Leads gerados",
    format: "NUMBER",
  },
  {
    key: "ctr",
    label: "CTR",
    description: "Click-through rate",
    format: "PERCENT",
    formula: "clicks / impressions",
    requiredFields: ["clicks", "impressions"],
  },
  {
    key: "cpc",
    label: "CPC",
    description: "Custo por clique",
    format: "CURRENCY",
    formula: "spend / clicks",
    requiredFields: ["spend", "clicks"],
  },
  {
    key: "cpm",
    label: "CPM",
    description: "Custo por mil impressões",
    format: "CURRENCY",
    formula: "(spend / impressions) * 1000",
    requiredFields: ["spend", "impressions"],
  },
  {
    key: "cpa",
    label: "CPA",
    description: "Custo por aquisição",
    format: "CURRENCY",
    formula: "spend / conversions",
    requiredFields: ["spend", "conversions"],
  },
  {
    key: "roas",
    label: "ROAS",
    description: "Retorno sobre investimento em mídia",
    format: "RATIO",
    formula: "revenue / spend",
    requiredFields: ["revenue", "spend"],
  },
];

async function seedReportTemplates(tenantId) {
  for (const template of REPORT_TEMPLATE_SEEDS) {
    const existing = await prisma.reportTemplate.findFirst({
      where: {
        tenantId,
        name: template.name,
        version: template.version,
      },
      select: { id: true },
    });

    if (existing) continue;

    await prisma.reportTemplate.create({
      data: {
        tenantId,
        name: template.name,
        description: template.description,
        visibility: template.visibility,
        layoutSchema: template.layoutSchema,
        widgetsSchema: template.widgetsSchema,
        version: template.version,
      },
    });
  }
}

async function seedMetricCatalog(tenantId) {
  for (const entry of METRIC_CATALOG_SEEDS) {
    await prisma.metricCatalog.upsert({
      where: {
        tenantId_source_level_metricKey_type: {
          tenantId,
          source: entry.source,
          level: entry.level,
          metricKey: entry.metricKey,
          type: entry.type,
        },
      },
      create: {
        tenantId,
        source: entry.source,
        level: entry.level,
        metricKey: entry.metricKey,
        dimensionKey: entry.dimensionKey || null,
        label: entry.label,
        type: entry.type,
        supportedCharts: entry.supportedCharts || [],
        supportedBreakdowns: entry.supportedBreakdowns || [],
        isDefault: Boolean(entry.isDefault),
      },
      update: {
        dimensionKey: entry.dimensionKey || null,
        label: entry.label,
        supportedCharts: entry.supportedCharts || [],
        supportedBreakdowns: entry.supportedBreakdowns || [],
        isDefault: Boolean(entry.isDefault),
      },
    });
  }
}

async function seedReportingAssets() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true },
  });

  for (const tenant of tenants) {
    await seedReportTemplates(tenant.id);
    await seedMetricCatalog(tenant.id);
  }
}

async function seedMetricsCatalogV2() {
  for (const entry of METRICS_CATALOG_V2_SEEDS) {
    await prisma.metricsCatalog.upsert({
      where: { key: entry.key },
      create: {
        key: entry.key,
        label: entry.label,
        description: entry.description,
        format: entry.format,
        formula: entry.formula || null,
        requiredFields: entry.requiredFields || null,
      },
      update: {
        label: entry.label,
        description: entry.description,
        format: entry.format,
        formula: entry.formula || null,
        requiredFields: entry.requiredFields || null,
      },
    });
  }
}

async function seedReportTemplatesV2() {
  for (const template of REPORT_TEMPLATES_V2_SEEDS) {
    const existing = await prisma.reportTemplateV2.findFirst({
      where: {
        name: template.name,
        tenantId: template.tenantId ?? null,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.reportTemplateV2.update({
        where: { id: existing.id },
        data: {
          category: template.category,
          layoutJson: template.layoutJson,
        },
      });
      continue;
    }

    await prisma.reportTemplateV2.create({
      data: {
        tenantId: template.tenantId ?? null,
        name: template.name,
        category: template.category,
        layoutJson: template.layoutJson,
      },
    });
  }
}

async function upsertPlans() {
  const plans = [
    {
      key: "starter_monthly",
      name: "Starter",
      description: "Plano inicial",
      priceCents: 0,
      interval: "MONTHLY",
      active: true,
      features: {
        clients: 15,
        users: 1,
      },
    },
    {
      key: "pro_monthly",
      name: "Pro",
      description: "Plano intermediário",
      priceCents: 19900,
      interval: "MONTHLY",
      active: true,
      features: {
        clients: 40,
        users: 3,
      },
    },
    {
      key: "agency_monthly",
      name: "Agency",
      description: "Plano agência",
      priceCents: 49900,
      interval: "MONTHLY",
      active: true,
      features: {
        clients: 100,
        users: 999,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      create: {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        interval: plan.interval,
        active: plan.active,
        features: plan.features,
      },
      update: {
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        interval: plan.interval,
        active: plan.active,
        features: plan.features,
      },
    });
  }

  const starter = await prisma.plan.findUnique({ where: { key: "starter_monthly" } });
  return starter;
}

async function ensureTenantAndAdmin(starterPlan) {
  const tenantName = requiredString("SEED_TENANT_NAME", "Kondor Demo");
  const tenantSlug = requiredString("SEED_TENANT_SLUG", "kondor-demo");

  const adminName = requiredString("SEED_ADMIN_NAME", "Admin");
  const adminEmail = normalizeEmail(
    requiredString("SEED_ADMIN_EMAIL", "admin@kondor.local")
  );
  const adminPassword = requiredString("SEED_ADMIN_PASSWORD", "admin123");

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    create: {
      name: tenantName,
      slug: tenantSlug,
      settings: {
        agency_name: tenantName,
        primary_color: "#A78BFA",
        accent_color: "#39FF14",
        logo_url: null,
      },
      planId: starterPlan?.id || null,
      status: "ACTIVE",
    },
    update: {
      name: tenantName,
      planId: starterPlan?.id || undefined,
      settings: {
        agency_name: tenantName,
        primary_color: "#A78BFA",
        accent_color: "#39FF14",
        logo_url: null,
      },
    },
  });

  const adminPasswordHash = await hashPassword(adminPassword);

  const existingAdmin = await prisma.user.findFirst({
    where: {
      tenantId: tenant.id,
      email: adminEmail,
    },
    select: { id: true },
  });

  const admin = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          name: adminName,
          passwordHash: adminPasswordHash,
          role: "ADMIN",
          isActive: true,
        },
      })
    : await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: adminEmail,
          name: adminName,
          passwordHash: adminPasswordHash,
          role: "ADMIN",
          isActive: true,
        },
      });

  if (starterPlan?.id) {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const latest = await prisma.subscription.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!latest) {
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: starterPlan.id,
          status: "SUCCEEDED",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    }
  }

  return { tenant, admin, adminPassword };
}

async function ensureSuperAdmin() {
  const create = envBool("SEED_CREATE_SUPERADMIN", true);
  if (!create) return null;

  const email = normalizeEmail(
    requiredString("SEED_SUPERADMIN_EMAIL", "superadmin@kondor.local")
  );
  const password = requiredString("SEED_SUPERADMIN_PASSWORD", "superadmin123");
  const passwordHash = await hashPassword(password);

  // SUPER_ADMIN é global por tenant (o schema é multi-tenant), então criamos em um tenant "control".
  // Se você preferir outro tenant, defina SEED_SUPERADMIN_TENANT_SLUG.
  const tenantSlug = requiredString("SEED_SUPERADMIN_TENANT_SLUG", "kondor-control");
  const tenantName = requiredString("SEED_SUPERADMIN_TENANT_NAME", "Kondor Control");

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    create: {
      name: tenantName,
      slug: tenantSlug,
      settings: { agency_name: tenantName },
      status: "ACTIVE",
    },
    update: { name: tenantName },
  });

  const existing = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
    select: { id: true },
  });

  try {
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: "Super Admin",
            passwordHash,
            role: "SUPER_ADMIN",
            isActive: true,
          },
        })
      : await prisma.user.create({
          data: {
            tenantId: tenant.id,
            email,
            name: "Super Admin",
            passwordHash,
            role: "SUPER_ADMIN",
            isActive: true,
          },
        });

    return { tenant, user, password };
  } catch (err) {
    console.warn(
      "[seed] Não foi possível criar SUPER_ADMIN (talvez o enum Role no banco ainda não tenha SUPER_ADMIN).",
      err?.message || err
    );
    return null;
  }
}

async function main() {
  console.log("[seed] Iniciando seed...");

  const starterPlan = await upsertPlans();
  const { tenant, admin, adminPassword } = await ensureTenantAndAdmin(starterPlan);
  const superAdmin = await ensureSuperAdmin();
  await seedReportingAssets();
  await seedMetricsCatalogV2();
  await seedReportTemplatesV2();

  console.log("[seed] OK.");
  console.log("[seed] Tenant:", { id: tenant.id, slug: tenant.slug, name: tenant.name });
  console.log("[seed] Admin:", { id: admin.id, email: admin.email, role: admin.role });
  console.log("[seed] Admin senha (dev):", adminPassword);
  if (superAdmin) {
    console.log("[seed] SuperAdmin:", {
      id: superAdmin.user.id,
      email: superAdmin.user.email,
      tenantSlug: superAdmin.tenant.slug,
    });
    console.log("[seed] SuperAdmin senha (dev):", superAdmin.password);
  }
}

main()
  .catch((err) => {
    console.error("[seed] Falhou:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
