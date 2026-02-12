# Deploy Sem Queda por Migrations

## Objetivo

Evitar que a API fique fora do ar quando `prisma migrate deploy` falha por falta de conexoes no Postgres.

## Padrao recomendado

1. **Web service (API):**
   - comando de start: `npm run start`
2. **Release job (antes do start da nova versao):**
   - comando: `npm run prisma:migrate:deploy:safe`

## Por que isso resolve

- O healthcheck da API nao fica bloqueado em migration.
- Migration roda isolada, com retry/backoff e pool reduzido.
- Falha de migration nao derruba a instancia em loop de restart.

## Script de migration segura

O script `scripts/prisma-migrate-deploy-safe.js`:

- usa `connection_limit=1` por padrao no DATABASE_URL de migration;
- aplica retry com backoff em erros transientes de conexao;
- suporta `PRISMA_MIGRATE_DATABASE_URL` para usar uma URL separada da runtime.

## Variaveis principais

- `DATABASE_URL`: URL da API em runtime.
- `PRISMA_MIGRATE_DATABASE_URL`: URL opcional da migration.
- `PRISMA_MIGRATE_CONNECTION_LIMIT`: default `1`.
- `PRISMA_MIGRATE_MAX_RETRIES`: default `8`.

## Pool de runtime (API/worker)

Para evitar erro de conexoes esgotadas no endpoint `/metrics/query`, configure:

- `PRISMA_CONNECTION_LIMIT` (default sugerido: `3`)
- `PRISMA_POOL_TIMEOUT` (default: `30`)
- `PRISMA_CONNECT_TIMEOUT` (default: `15`)
- `PRISMA_PGBOUNCER=true` (somente se estiver usando pooler)

O arquivo `src/prisma.js` injeta esses parametros na `DATABASE_URL` quando eles nao estao presentes na URL.

## Exemplo (DigitalOcean App Platform)

- **API service start command:** `npm run start`
- **Job de release:** `npm run prisma:migrate:deploy:safe`
