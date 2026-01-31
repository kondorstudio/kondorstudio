// path: docs/control-center-security.md
# Kondor Control Center — Revisão de Segurança e Deploy

## 1. Auditoria de Segurança

- **Proteção das rotas admin**: todas as rotas sob `/api/admin` passam por `authMiddleware` + `tenantMiddleware` + `checkSubscription` global e, antes de qualquer handler específico, pelo `ensureAdminAccess` (`api/src/routes/admin.js:311`). Esse middleware valida roles administrativas (SUPER_ADMIN, SUPPORT, FINANCE, TECH) e bloqueia com 403 caso contrário (`api/src/middleware/ensureAdminAccess.js`).
- **Fluxo de impersonação**: `POST /api/admin/impersonate` garante que o alvo não seja SUPER_ADMIN, gera sessão isolada com expiração e grava auditoria (`api/src/routes/admin.js:671-843`). O encerramento (`/impersonate/stop`) valida o `superAdminId` original e remove o token da sessão.
- **Edição de usuários**: `PATCH /api/admin/users/:id` impede modificações em usuários SUPER_ADMIN e bloqueia atribuição dessa role por esta rota (`api/src/routes/admin.js:584-636`). Mudanças aceitam apenas roles conhecidas e status booleano.
- **Logs e observabilidade**: `errorLogger` escreve cada erro em `SystemLog` com metadata (rota, usuário, IP). Falhas no worker são gravadas em `JobLog`. Ambos expostos nas páginas de logs/jobs.
- **Front guard**: `AdminRoute` garante token válido + role administrativa antes de renderizar o sub-app admin (`front/src/components/adminRoute.jsx`). O layout mostra banner ao estar em modo impersonate e expõe ação explícita para encerrar.
- **MFA**: `mfaService.shouldRequireMfa` exige MFA para SUPER_ADMIN/ADMIN e, com `ADMIN_MFA_ENABLED=true`, também para SUPPORT/FINANCE/TECH no login. O fluxo é validado via `/auth/mfa/verify`.
- **Outros cuidados**: 
  - `SystemLog` aceita `metadata` JSON para contexto, e as consultas paginam e filtram.
  - Tokens de impersonate têm TTL configurável (`IMPERSONATION_TOKEN_EXPIRES_IN` e `IMPERSONATION_SESSION_TTL_MINUTES`).
  - Auditoria das ações sensíveis (impersonate start/stop) é persistida.

## 2. Checklist de Segurança Contínua

1. **Variáveis sensíveis**: Configure `JWT_SECRET`, `IMPERSONATION_TOKEN_EXPIRES_IN`, `IMPERSONATION_SESSION_TTL_MINUTES`, `AUDIT_LOG_ENABLED`, `CORS_ORIGIN`, `VITE_API_URL` e credenciais de banco/redis. Nunca versione valores reais.
2. **CORS**: defina `CORS_ORIGIN` com a URL pública do front admin e demais frontends. Em produção, o backend já alerta caso essa env esteja ausente.
3. **Sessions/Storage**: mantenha `sessionToken` com hash seguro; revogue tokens impersonate imediatamente via `/impersonate/stop`.
4. **Permissões**: limite criação de usuários SUPER_ADMIN ao seed/controlado manualmente. Em produção, execute auditorias periódicas (`SELECT * FROM users WHERE role = 'SUPER_ADMIN'`).
5. **Observabilidade**: monitore `SystemLog` para erros de autorização, 5xx e falhas em filas. Configure alertas no Render/LogDNA/DataDog conforme necessidade.
6. **Backups**: use snapshots do Postgres e mantenha `DATABASE_URL` somente via variáveis seguras do Render.

## 3. Deploy no Render

1. **API (`kondor-api`)**:
   - `buildCommand`: `npm install && npm run deploy:migrate && npm run prisma:generate`.
   - `startCommand`: `npm start`.
   - Verificar envs obrigatórias (vide seção 2). Inclua também integrações (WhatsApp, S3, billing) mesmo que vazias.
2. **Worker (`kondor-worker`)**:
   - `startCommand`: `npm run worker`.
   - Compartilha a maioria das envs da API; valide `REDIS_URL` e períodos de fila.
3. **Frontend (`kondor-front`)**:
   - `npm install --include=dev && npm run build`.
   - `startCommand`: `serve -s dist -l 3000`.
   - Configure `VITE_API_URL` apontando para a URL pública da API Render (HTTPS).
4. **Banco/Redis**: já definidos em `render.yaml`; apenas confirme planos compatíveis com o volume esperado.
5. **Migrations**:
   - Rodar localmente: `cd api && npx prisma migrate deploy`.
   - Em produção: via `npm run deploy:migrate` no build da API.
6. **Smoke tests pós-deploy**:
   - `GET https://<api>/healthz` deve retornar `{"status":"ok","db":"ok"}`.
   - `GET https://<front>/admin` autenticado como SUPER_ADMIN deve carregar overview.
   - Verificar logs Render (API + Worker) para garantir que não existem erros de CORS/JWT.

## 4. Procedimentos Operacionais

- **Onboarding de SUPER_ADMIN**: criar usuário diretamente no banco (`users.role = 'SUPER_ADMIN'`, `isActive = true`), forçar reset de senha e registrar no vault interno.
- **Resposta a incidentes**: usar `/api/admin/logs` e `/api/admin/jobs` filtrando por tenant para identificar quedas específicas; combine com notas de suporte.
- **Testes antes de subir release**:
  1. Rodar `npm test`/linters (quando existirem).
  2. `npm run build` no front.
  3. Executar worker local (`npm run worker`) verificando registro em `JobLog`.

Com este checklist, o Control Center permanece restrito ao SUPER_ADMIN, com impersonate auditado e toda a instrumentação necessária para acompanhar produção no Render.
