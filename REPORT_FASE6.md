# REPORT_FASE6.md

## Ambiente (pre-check)
- git status: `M front/package-lock.json`, `M front/package.json`, `M front/src/components/reports/ConnectDataSourceDialog.jsx`, `M front/src/layout.jsx`, `M front/src/pages/reports/DashboardBuilder.jsx`, `M front/src/pages/reports/DashboardViewer.jsx`, `M front/src/styles/global.css`, `?? REPORT_FASE6.md`, `?? front/playwright.config.js`, `?? front/test-artifacts/`, `?? front/test-results/`, `?? front/tests/`
- git log -1: `799f989 fix(reports): treat auth errors as no-connection and track last update`
- npm -v: `11.6.2`
- node -v: `v24.11.1`

## Scripts disponiveis
- front/package.json: scripts = `dev`, `build`, `preview` (lint/test nao definidos)
- api/package.json: scripts = `dev`, `build`, `test`, `start`, `worker`, `seed`

## Comandos executados
- `git status --short`
- `git log -1 --oneline`
- `npm -v && node -v`
- `npm run build` (front)
- `npm run build` (api)
- `npm run test` (api)
- `npx playwright test tests/reports-phase6.spec.js` (front)

## Build/Test
- front build: PASS (`npm run build`)
- api build: PASS (`npm run build` -> prisma generate)
- api test: PASS (`npm run test` -> node --test)
- playwright: PASS (9 tests)

## Validacao manual Fase 6 (A-I)

### A) Sem conexao (KPI Meta Ads)
- Status: PASS
- Passos executados: abrir builder, selecionar marca global, adicionar KPI, configurar source META_ADS + metrica, verificar empty state, clicar "Associar conta", conectar conta mock, confirmar que widget renderiza sem refresh.
- Evidencia: `/front/test-artifacts/phase6/A.png`
- Notas: conexao criada via mock de `/reporting/brands/:id/connections/link`.

### B) Sem metricas selecionadas
- Status: PASS
- Passos executados: adicionar KPI, configurar source/level, salvar sem metricas.
- Evidencia: `/front/test-artifacts/phase6/B.png`

### C) Sem dados no periodo
- Status: PASS
- Passos executados: conexao valida + response vazio (mock `widgetQueryMode=empty`).
- Evidencia: `/front/test-artifacts/phase6/C.png`

### D) Erro forcado + retry
- Status: PASS
- Passos executados: mock retorna 500 para `/reporting/metrics/query`, verifica error state, alterna mock para sucesso, clica "Tentar novamente" e valida dado.
- Evidencia: `/front/test-artifacts/phase6/D.png`

### E) Last updated apos refresh all
- Status: PASS
- Passos executados: carregar KPI, clicar "Atualizar dados", validar incremento de queries e label de atualizado.
- Evidencia: `/front/test-artifacts/phase6/E.png`

### F) Auto-refresh 5m sem travar UI
- Status: PASS
- Passos executados: selecionar Auto-refresh 5m (intervalo encurtado para 3s via patch de teste), aguardar 2 ciclos e validar incremento de queries.
- Evidencia: `/front/test-artifacts/phase6/F.png`

### G) Modo TV oculta sidebar/acoes
- Status: PASS
- Passos executados: ativar Modo TV no builder, validar sidebars ocultas e layout limpo.
- Evidencia: `/front/test-artifacts/phase6/G.png`

### H) ESC sai do fullscreen
- Status: PASS
- Passos executados: ativar Modo TV, confirmar botao "Sair do modo TV", enviar ESC, validar retorno do botao "Modo TV".
- Evidencia: `/front/test-artifacts/phase6/H.png`

### I) Auto-refresh em tvMode
- Status: PASS
- Passos executados: abrir viewer, ativar Modo TV, ligar Auto-refresh 5m (encurtado para 3s), validar incremento de queries.
- Evidencia: `/front/test-artifacts/phase6/I.png`

## Observacoes
- Playwright roda com mock de API via `page.route` e injecao de auth em `localStorage`.
- Fullscreen simulado via override de `document.requestFullscreen` no teste.
- Warnings no console: `validateDOMNesting` no MetricMultiSelect e aviso do CDN do tailwind (nao bloqueiam os testes).

## Correcoes aplicadas durante validacao
- tvMode agora oculta sidebar principal usando classe global `tv-mode` e CSS dedicado.
- Ajuste em ConnectDataSourceDialog para aceitar `Integration.list()` retornando array.
- Ordem de effects no DashboardBuilder corrigida para evitar acesso antes de inicializacao (auto-refresh).
