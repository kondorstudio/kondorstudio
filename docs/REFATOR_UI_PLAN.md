# Kondor UI Refator (Etapas 0/1) - Levantamento

## Setup local (executado)
- API deps: `cd api && npm ci`
  - OK (avisos de dependencias deprecated e vulnerabilidades em npm audit).
- Front deps: `cd front && npm ci`
  - OK (avisos de vulnerabilidades moderadas em npm audit).
- API dev: `cd api && npm run dev`
  - Falhou no ambiente atual: erro `listen EPERM` ao bindar `0.0.0.0:4000`.
- Front dev: `cd front && npm run dev`
  - Falhou no ambiente atual: erro `listen EPERM` ao bindar `::1:5173`.

Observacao: o sandbox atual impede binding de porta local. As rotas nao puderam ser confirmadas via HTTP local.

## Stack e arquitetura
### Frontend
- React 18 + Vite.
- Router: `react-router-dom` (ver `front/src/app.jsx`).
- Estado/requests: `@tanstack/react-query` + `base44Client` (`front/src/apiClient/base44Client.js`).
- UI: Tailwind via CDN (`front/index.html`), componentes base em `front/src/components/ui`.
- Estilo global: `front/src/styles/global.css` com tokens CSS e regras base.

### Backend
- Node + Express (`api/src/server.js`).
- ORM: Prisma (`api/prisma/schema.prisma`, `api/src/prisma.js`).
- Multi-tenant: middleware `auth` + `tenant` + `checkSubscription`.
- Jobs: BullMQ (`api/src/worker.js`).

## Modelos relevantes (Prisma)
- `Tenant`, `User`, `Client`.
- `Post`, `Approval`, `Task`, `Metric`.
- `Integration`, `Report`, `Upload`, `FinancialRecord`.

## Estrutura de pastas (principais)
- `api/src/routes` (rotas REST). Ex: `posts.js`, `metrics.js`, `approvals.js`.
- `api/src/services` (logica de negocio). Ex: `postsService.js`.
- `front/src/pages` (telas). Ex: `posts.jsx`, `dashboard.jsx`.
- `front/src/components` (componentes). Ex: `posts/postkanban.jsx`.
- `front/src/components/ui` (componentes base).

## Ponto atual do modulo de Posts
- Pagina: `front/src/pages/posts.jsx`.
- Kanban atual: `front/src/components/posts/postkanban.jsx`.
- Cards: `front/src/components/posts/postcard.jsx`.
- Status atuais no backend: `PostStatus` em `api/prisma/schema.prisma`.

## Layout existente
- Shell principal: `front/src/layout.jsx` (sidebar simples + topbar mobile).
- Ha componentes de sidebar em `front/src/components/ui/sidebar.jsx`, mas nao usados no shell.

## Acoplamentos relevantes
- Front usa `base44.entities.Post.list()` e similares para consumo de API.
- `postsService.list()` suporta filtros basicos (status/clientId/q) e pagina.
- Layout e paginas usam utilitarios de UI com classes Tailwind via CDN.
- Tokens CSS globais usados apenas em `Layout` (var --primary / --primary-light).

## Riscos observados
- Tailwind via CDN sem config local: padronizacao de tokens depende de CSS vars e classes utilitarias.
- Sem scripts de lint/test no projeto; apenas `npm run build` disponivel.
- Dev server bloqueado por restricao de portas (EPERM).
- Existem modificacoes locais em `api/src/middleware/auth.js` e `api/src/middleware/tenant.js` (nao tocar).

## Decisoes iniciais (Etapa 1)
- Centralizar tokens em CSS vars (`front/src/styles/global.css`) e ajustar layout base para o novo visual.
- Criar componentes base novos em `front/src/components/ui`: PageHeader, FilterBar, EmptyState, StatPill.
- Reutilizar `components/ui/sidebar.jsx` para o novo shell (Sidebar + Topbar).
- Manter Tailwind CDN e padronizar classes ao inves de migrar para build de Tailwind.

## Proximos passos (Etapa 1)
1) Atualizar tokens e base global.
2) Criar componentes base (PageHeader, FilterBar, StatPill, EmptyState).
3) Refatorar Layout para nova sidebar/topbar, mantendo rotas existentes.
4) Aplicar layout nas paginas principais sem alterar logica de posts.
