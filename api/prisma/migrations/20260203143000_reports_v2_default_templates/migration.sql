-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO "report_template" (
  "id",
  "tenantId",
  "name",
  "category",
  "layoutJson",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  NULL,
  'Kondor - Ads Overview',
  'Ads',
  $$
  {
    "theme": {
      "mode": "light",
      "brandColor": "#F59E0B",
      "accentColor": "#22C55E",
      "bg": "#FFFFFF",
      "text": "#0F172A",
      "mutedText": "#64748B",
      "cardBg": "#FFFFFF",
      "border": "#E2E8F0",
      "radius": 16
    },
    "globalFilters": {
      "dateRange": { "preset": "last_30_days" },
      "platforms": [],
      "accounts": [],
      "compareTo": null,
      "autoRefreshSec": 0
    },
    "widgets": [
      {
        "id": "a1111111-1111-4111-8111-111111111111",
        "type": "kpi",
        "title": "Spend",
        "layout": { "x": 0, "y": 0, "w": 3, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["spend"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a2222222-2222-4222-8222-222222222222",
        "type": "kpi",
        "title": "Impressions",
        "layout": { "x": 3, "y": 0, "w": 3, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["impressions"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a3333333-3333-4333-8333-333333333333",
        "type": "kpi",
        "title": "Clicks",
        "layout": { "x": 6, "y": 0, "w": 3, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["clicks"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a4444444-4444-4444-8444-444444444444",
        "type": "kpi",
        "title": "CTR",
        "layout": { "x": 9, "y": 0, "w": 3, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["ctr"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a5555555-5555-4555-8555-555555555555",
        "type": "kpi",
        "title": "Conversions",
        "layout": { "x": 0, "y": 2, "w": 3, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["conversions"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a6666666-6666-4666-8666-666666666666",
        "type": "kpi",
        "title": "CPA",
        "layout": { "x": 3, "y": 2, "w": 3, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["cpa"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a7777777-7777-4777-8777-777777777777",
        "type": "kpi",
        "title": "Revenue",
        "layout": { "x": 6, "y": 2, "w": 3, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["revenue"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a8888888-8888-4888-8888-888888888888",
        "type": "kpi",
        "title": "ROAS",
        "layout": { "x": 9, "y": 2, "w": 3, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["roas"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a9999999-9999-4999-8999-999999999999",
        "type": "timeseries",
        "title": "Spend ao longo do tempo",
        "layout": { "x": 0, "y": 4, "w": 12, "h": 4, "minW": 4, "minH": 3 },
        "query": { "dimensions": ["date"], "metrics": ["spend"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "a0a0a0a0-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "type": "bar",
        "title": "Spend por plataforma",
        "layout": { "x": 0, "y": 8, "w": 6, "h": 4, "minW": 3, "minH": 3 },
        "query": { "dimensions": ["platform"], "metrics": ["spend"], "filters": [] },
        "viz": { "variant": "default", "showLegend": true, "format": "auto", "options": {} }
      },
      {
        "id": "abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "type": "table",
        "title": "Campanhas",
        "layout": { "x": 6, "y": 8, "w": 6, "h": 4, "minW": 3, "minH": 3 },
        "query": { "dimensions": ["campaign_id"], "metrics": ["spend", "conversions", "roas"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      }
    ]
  }
  $$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "report_template"
  WHERE "tenantId" IS NULL
    AND "name" = 'Kondor - Ads Overview'
);

INSERT INTO "report_template" (
  "id",
  "tenantId",
  "name",
  "category",
  "layoutJson",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  NULL,
  'Kondor - GA4 Overview',
  'GA4',
  $$
  {
    "theme": {
      "mode": "light",
      "brandColor": "#F59E0B",
      "accentColor": "#22C55E",
      "bg": "#FFFFFF",
      "text": "#0F172A",
      "mutedText": "#64748B",
      "cardBg": "#FFFFFF",
      "border": "#E2E8F0",
      "radius": 16
    },
    "globalFilters": {
      "dateRange": { "preset": "last_30_days" },
      "platforms": ["GA4"],
      "accounts": [],
      "compareTo": null,
      "autoRefreshSec": 0
    },
    "widgets": [
      {
        "id": "b1111111-1111-4111-8111-111111111111",
        "type": "kpi",
        "title": "Sessions",
        "layout": { "x": 0, "y": 0, "w": 4, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["sessions"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "b2222222-2222-4222-8222-222222222222",
        "type": "kpi",
        "title": "Leads",
        "layout": { "x": 4, "y": 0, "w": 4, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["leads"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "b3333333-3333-4333-8333-333333333333",
        "type": "kpi",
        "title": "Conversions",
        "layout": { "x": 8, "y": 0, "w": 4, "h": 2, "minW": 2, "minH": 2 },
        "query": { "dimensions": [], "metrics": ["conversions"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "b4444444-4444-4444-8444-444444444444",
        "type": "timeseries",
        "title": "Sessions ao longo do tempo",
        "layout": { "x": 0, "y": 2, "w": 12, "h": 4, "minW": 4, "minH": 3 },
        "query": { "dimensions": ["date"], "metrics": ["sessions"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      },
      {
        "id": "b5555555-5555-4555-8555-555555555555",
        "type": "table",
        "title": "Campanhas",
        "layout": { "x": 0, "y": 6, "w": 12, "h": 4, "minW": 4, "minH": 3 },
        "query": { "dimensions": ["campaign_id"], "metrics": ["sessions", "conversions"], "filters": [] },
        "viz": { "variant": "default", "showLegend": false, "format": "auto", "options": {} }
      }
    ]
  }
  $$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "report_template"
  WHERE "tenantId" IS NULL
    AND "name" = 'Kondor - GA4 Overview'
);
