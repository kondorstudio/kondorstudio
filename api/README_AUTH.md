AUTH + MULTI-TENANT - Setup

1) Instalar dependências
$ cd api
$ npm ci

2) Configurar .env
Copy .env.example -> .env and edit DATABASE_URL and secrets.

3) Gerar Prisma Client e migrar
$ npx prisma generate
$ npx prisma migrate dev --name init_auth

4) Rodar server
$ npm run dev
Server on http://localhost:4000

Endpoints:
- POST /tenants/register
  body: { tenantName, tenantSlug, userName, userEmail, password }

- POST /auth/login
  body: { email, password }

- POST /auth/refresh
  body: { refreshToken }

- POST /auth/logout
  body: { refreshToken }

- GET /me  (Require Authorization: Bearer <accessToken>)
