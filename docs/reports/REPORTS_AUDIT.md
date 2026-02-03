# REPORTS_AUDIT (Kondor Studio)
Data da auditoria: 2026-02-03

## Decisão de produto
Relatórios = **V2**. O produto ativo usa:
- UI `/relatorios/v2`.
- API `/api/reports/*`.
- Query `/api/metrics/query`.

As stacks V1 (`/api/reporting`) e legado (`/api/reports` PDF/TXT) permanecem **apenas por compatibilidade**, sem uso pela UI atual.

## Escopo
Auditoria e cleanup do módulo de Relatórios no front e back, consolidando V2 como produto e mantendo V1/legado somente como compatibilidade técnica (sem migração de dados).

## 1) Mapa de arquivos (path + resumo)

### Frontend
- `front/src/app.jsx` — Rotas de `/relatorios/v2` e redirects `/relatorios` e `/reports` → V2.
- `front/src/layout.jsx` — Menu “Relatorios” e badge de conexões V2.
- `front/src/pages/reportsV2/ReportsV2Home.jsx` — Home V2 (lista dashboards + CTA templates/conexões).
- `front/src/pages/reportsV2/ReportsV2Templates.jsx` — Lista/instancia templates V2.
- `front/src/pages/reportsV2/ReportsV2Connections.jsx` — Vincula contas por marca (V2).
- `front/src/pages/reportsV2/ReportsV2Viewer.jsx` — Viewer V2 (filtros globais + widgets).
- `front/src/pages/reportsV2/ReportsV2Editor.jsx` — Editor V2 (layout, versões, publish).
- `front/src/components/reportsV2/DashboardRenderer.jsx` — Renderiza grid V2.
- `front/src/components/reportsV2/WidgetRenderer.jsx` — Query de dados via `/metrics/query`.
- `front/src/components/reportsV2/GlobalFiltersBar.jsx` — UI filtros globais V2.
- `front/src/components/reportsV2/utils.js` — Keys de cache e merge de filtros.
- `front/src/components/reports/widgets/DashboardCanvas.jsx` — Grid compartilhado (V2 e analytics).
- `front/src/components/reports/widgets/WidgetEmptyState.jsx` — Empty state compartilhado.
- `front/src/components/reports/widgets/WidgetErrorState.jsx` — Error state compartilhado.
- `front/src/components/reports/widgets/WidgetSkeleton.jsx` — Loading state compartilhado.
- `front/src/pages/analytics/dashboards.jsx` — Dashboards GA4 (mantido).
- `front/src/pages/analytics/dashboardBuilder.jsx` — Builder GA4 (mantido).
- `front/src/pages/admin/AdminReports.jsx` — “Relatorios” do admin (métricas executivas).
- `front/src/pages/admin/AdminLayout.jsx` — Menu admin com “Relatorios”.
- `front/src/pages/integrations.jsx` — Copy menciona “relatorios”.
- `front/src/pages/integrations/ga4.jsx` — “demo report” GA4.
- `front/src/apiClient/base44Client.js` — Clients `/reports/*` e `/metrics/query`.
- `front/src/utils/adminPermissions.js` — Permissão `reports.read` (admin).
- `front/src/styles/global.css` — Tokens visuais `reporting-surface`.

### Backend — Reports V2 (`/api/reports/*`)
- `api/src/routes/reportsDashboards.js` — Entry point `/api/reports/dashboards`.
- `api/src/modules/reports/dashboards.routes.js` — Rotas V2 de dashboards.
- `api/src/modules/reports/dashboards.controller.js` — Controller V2.
- `api/src/modules/reports/dashboards.service.js` — CRUD + versionamento (`report_dashboard`).
- `api/src/modules/reports/dashboards.validators.js` — Validação V2.
- `api/src/routes/reportsTemplates.js` — Entry point `/api/reports/templates`.
- `api/src/modules/reports/templates.routes.js` — Rotas V2 de templates.
- `api/src/modules/reports/templates.controller.js` — Controller V2.
- `api/src/modules/reports/templates.service.js` — Instancia dashboards a partir de template.
- `api/src/modules/reports/templates.validators.js` — Validação V2.
- `api/src/routes/reportsConnections.js` — Entry point `/api/reports/connections`.
- `api/src/modules/reports/connections.routes.js` — Rotas V2 de conexões.
- `api/src/modules/reports/connections.controller.js` — Controller V2.
- `api/src/modules/reports/connections.service.js` — Linkagem `brand_source_connection`.
- `api/src/modules/reports/connections.validators.js` — Validação V2.
- `api/src/shared/validators/reportLayout.ts` — Schema de layout V2 (Zod).

### Backend — Metrics agregadas (`/api/metrics/query`)
- `api/src/routes/metrics.js` — Rota `/api/metrics` + `/api/metrics/query`.
- `api/src/modules/metrics/metrics.routes.js` — Roteamento `/metrics/query`.
- `api/src/modules/metrics/metrics.controller.js` — Controller query.
- `api/src/modules/metrics/metrics.service.js` — Agregação em `fact_kondor_metrics_daily`.

### Backend — Compatibilidade (V1 e legado)
- `api/src/routes/reporting.js` — **DEPRECATED** `/api/reporting` (V1).
- `api/src/modules/reporting/*` — Reports V1 (templates, reports, dashboards, exports, schedules).
- `api/src/routes/reports.js` — **DEPRECATED** `/api/reports` (legado PDF/TXT).
- `api/src/services/reportBuilder.js` — Geração PDF/TXT legado.
- `api/src/services/reportsService.js` — CRUD legado em `reports`.
- `api/src/jobs/reportGenerationJob.js` — Worker legado.
- `api/src/services/schedulerService.js` — Agendamento legado.
- `api/src/services/automationEngine.js` — Evento `report.ready` (legado WhatsApp).
- `api/src/services/automationSettingsService.js` — Configs de automação legado.

### Backend — Infra e testes
- `api/src/server.js` — Mount `/api/reports/*`, `/api/reporting/*`, `/api/metrics`.
- `api/src/queues/index.js` — Filas `report-generate`, `report-schedule`, `dashboard-refresh`.
- `api/src/jobs/reportingGenerateJob.js` — Worker V1 snapshots.
- `api/src/jobs/reportScheduleJob.js` — Worker V1 schedules.
- `api/prisma/schema.prisma` — Modelos/tabelas de reports/dashboards/templates/widgets.
- `api/prisma/seed.js` — Seeds V1/V2.
- `api/test/reportsDashboards.test.js` — Testes V2 (dashboards/versionamento).
- `api/test/reportsTemplates.test.js` — Testes V2 (templates).
- `api/test/reportsConnections.test.js` — Testes V2 (connections).
- `api/test/reportLayoutValidator.test.js` — Testes do schema de layout V2.

## 2) Fluxo atual (de onde vêm os dados)

### 2.1 Reports V2 (produto ativo)
1. **Templates**: `/api/reports/templates` lista `report_template` (model `ReportTemplateV2`).
2. **Instanciar template**: `/api/reports/templates/:id/instantiate` cria `report_dashboard` + versão `report_dashboard_version` com `layoutJson`.
3. **Editor**: `/api/reports/dashboards/:id/versions` cria versões; `/publish` aponta versão publicada. Layout validado por `reportLayoutSchema`.
4. **Viewer**: widgets chamam `/api/metrics/query`, que agrega dados em `fact_kondor_metrics_daily` e valida métricas em `metrics_catalog`.
5. **Conexões**: `/api/reports/connections` grava `brand_source_connection`. `available` lê `data_source_connections` (contas conectadas).

### 2.2 Reporting V1 (compatibilidade)
- Mantido em `/api/reporting/*` apenas para compatibilidade.
- Não utilizado pela UI atual de Relatórios.

### 2.3 Legado `/api/reports` (compatibilidade)
- Rotas de PDF/TXT e envio antigo mantidas por compatibilidade.
- Não utilizado pela UI atual de Relatórios.

## 3) O que é mock x real x integrado

### (a) UI mock / placeholders
- `front/src/pages/reportsV2/ReportsV2Home.jsx` — Card “Automacoes” com copy “em breve”.
- `front/src/pages/reportsV2/ReportsV2Connections.jsx` — Botão “Resumo da fonte” sem ação.
- Adapters `META_SOCIAL` e `GBP` retornam `meta.mocked=true` no V1.

### (b) API real com dados funcionando
- `/api/reports/dashboards` — CRUD + versões (Prisma `report_dashboard`, `report_dashboard_version`).
- `/api/reports/templates` — Templates V2 (`report_template`).
- `/api/reports/connections` — `brand_source_connection` (linkagem por marca).
- `/api/metrics/query` — Consulta agregada em `fact_kondor_metrics_daily` com validação via `metrics_catalog`.

### (c) Acoplado a integrações externas
- `/api/reporting/*` — Adapters em `api/src/modules/reporting/providers/*` (Meta, Google Ads, GA4, TikTok, LinkedIn).
- `/api/reporting/connections/*` — Depende de integrações conectadas (tokens, contas).
- `/api/reporting/connections/:id/ga4/*` — GA4 metadata e compatibilidade.
- `/api/reporting/reports/:id/exports` — Playwright + uploadsService.
- `/api/reporting/schedules` — BullMQ + emailService.
- `/api/reports/connections/available` — Reusa `data_source_connections` originadas de integrações.

## 4) Modelos Prisma / Tabelas relacionadas

### Reports V2
- `ReportDashboard` → `report_dashboard`.
- `ReportDashboardVersion` → `report_dashboard_version`.
- `ReportTemplateV2` → `report_template`.
- `BrandSourceConnection` → `brand_source_connection`.
- `FactKondorMetricsDaily` → `fact_kondor_metrics_daily` (dados para widgets).
- `MetricsCatalog` → `metrics_catalog` (catálogo p/ `/metrics/query`).

### Reporting V1
- `Report` → `reports` (compartilhado com legado).
- `ReportTemplate` → `report_templates`.
- `ReportWidget` → `report_widgets`.
- `Dashboard` → `dashboards`.
- `MetricCatalog` → `metric_catalog`.
- `DataSourceConnection` → `data_source_connections`.
- `ReportExport` → `report_exports`.
- `ReportDelivery` → `report_deliveries`.
- `ReportSchedule` → `report_schedules`.

### Legado
- `Report` → `reports`.
- `Metric` → `metrics`.
- `Upload` → `uploads`.

## 5) Dívidas técnicas e riscos
- **Três stacks concorrentes**: `/api/reporting` (V1), `/api/reports` (legado PDF) e `/api/reports/*` (V2).
- **Tabela `reports` compartilhada**: legado e V1 usam o mesmo modelo com semânticas distintas.
- **Dois catálogos de métricas**: `metric_catalog` (V1) vs `metrics_catalog` (V2).
- **Conexões duplicadas**: `data_source_connections` (V1) e `brand_source_connection` (V2) não estão unificadas.
- **V2 não aplica reportingScope**: `/api/reports/*` usa apenas role, sem restrição por marca.
- **V2 não usa conexões para query**: `/metrics/query` filtra por `brandId`, sem validar `brand_source_connection`.
- **Adapters parciais**: `META_SOCIAL` e `GBP` retornam dados mockados (V1).
- **Exports dependem de Playwright**: falha se não instalado/configurado.
- **Legado /reports send email**: placeholder (não envia de fato).

## 6) O que ainda existe por compatibilidade
- `/api/reporting/*` (Reports V1) — mantido para integrações/fluxos antigos, sem UI ativa.
- `/api/reports` (PDF/TXT legado) — mantido para downloads/envios antigos.
- Workers e serviços V1/legado (`reportGenerationJob`, `reportBuilder`, `schedulerService`) — não usados pela UI atual.

## 7) Plano de evolução (V2 only)
1. Consolidar métricas e conexões em um único modelo (substituir V1 e legado).
2. Criar pipeline V2 para exports/schedules (substituir `reportExports.service` V1).
3. Remover `/api/reporting` e `/api/reports` após janela de compatibilidade.
4. Limpar tabelas e migrações antigas em fase separada.
