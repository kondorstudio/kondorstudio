# GA4 Integration (Kondor Studio)

## 1) Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable APIs:
   - Google Analytics Data API
   - Google Analytics Admin API
3. Configure OAuth Consent Screen:
   - App name: Kondor Studio
   - Scope: `https://www.googleapis.com/auth/analytics.readonly`
   - Add test users if needed
4. Create OAuth Client ID (Web application):
   - Authorized redirect URIs:
     - `http://localhost:3000/api/integrations/ga4/oauth/callback`
     - `https://YOUR_PROD_DOMAIN/api/integrations/ga4/oauth/callback`

## 2) Environment variables

Backend (`api/.env`):

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_SCOPES="https://www.googleapis.com/auth/analytics.readonly"`
- `ENCRYPTION_KEY` (32 bytes base64 or hex, AES-256-GCM)
- `APP_URL_FRONT` (ex: `http://localhost:5173`)
- `API_URL` (ex: `http://localhost:3000`)
- Optional:
  - `GA4_MOCK_MODE=true` to return fake data
  - `GA4_CACHE_TTL_MS=120000`
  - `GA4_METADATA_TTL_MS=86400000`
  - `GA4_MAX_CONCURRENT=5`
  - `GA4_RATE_LIMIT_MAX=60`
  - `GA4_RATE_LIMIT_WINDOW_MS=60000`

## 3) Database migration

Run migrations:

```bash
cd api
npm run prisma:migrate
```

## 4) OAuth flow

1. Frontend calls `GET /api/integrations/ga4/oauth/start`.
2. Backend returns `{ url }`.
3. Frontend redirects user to Google.
4. Google redirects to `/api/integrations/ga4/oauth/callback`.
5. Backend stores tokens (encrypted) and redirects back to the frontend.

Notas:
- `prompt=consent` só é usado quando o status do tenant é `NEEDS_RECONNECT` ou quando o frontend envia `forceConsent=true`.
- A integração GA4 é **tenant-scoped** (1 integração por tenant).

## 5) Main endpoints

### GA4 integration

- `GET /api/integrations/ga4/oauth/start`
- `GET /api/integrations/ga4/oauth/callback`
- `POST /api/integrations/ga4/disconnect`
- `GET /api/integrations/ga4/status`
- `GET /api/integrations/ga4/properties`
- `GET /api/integrations/ga4/properties/sync`
- `POST /api/integrations/ga4/properties/select`
- `GET /api/integrations/ga4/metadata`

### Analytics dashboards

- `GET /api/analytics/dashboards`
- `POST /api/analytics/dashboards`
- `GET /api/analytics/dashboards/:id`
- `PUT /api/analytics/dashboards/:id`
- `DELETE /api/analytics/dashboards/:id`
- `POST /api/analytics/dashboards/:id/widgets`
- `PUT /api/analytics/widgets/:widgetId`
- `DELETE /api/analytics/widgets/:widgetId`
- `POST /api/analytics/widgets/preview`
- `POST /api/analytics/ga4/run-report`

## 6) Example run-report payload

```json
{
  "propertyId": "123456789",
  "dateRange": { "type": "LAST_30_DAYS" },
  "dimensions": ["date", "sessionSourceMedium"],
  "metrics": ["sessions", "activeUsers"],
  "orderBys": [{ "metric": { "metricName": "sessions" }, "desc": true }],
  "limit": 1000
}
```

## 7) Troubleshooting

- Refresh token missing:
  - If Google does not return `refresh_token`, use `prompt=consent` and reconnect.
- Status `NEEDS_RECONNECT`:
  - Indica que o refresh token foi revogado/expirou e o usuário precisa reconectar.
  - O frontend deve mostrar CTA de reconexão e reiniciar o OAuth.
- 403 / insufficient permissions:
  - Check that the connected Google account has access to the GA4 property.
- Quota exceeded:
  - Reduce concurrency, increase cache TTL, or retry later.
- Invalid metric/dimension:
  - Use `/api/integrations/ga4/metadata` to populate selectors and validate inputs.
