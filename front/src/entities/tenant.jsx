{
  "name": "Tenant",
  "type": "object",
  "properties": {
    "agency_name": {
      "type": "string",
      "description": "Nome da ag\u00eancia"
    },
    "logo_url": {
      "type": "string",
      "description": "URL do logo da ag\u00eancia"
    },
    "primary_color": {
      "type": "string",
      "default": "#A78BFA",
      "description": "Cor prim\u00e1ria do tema"
    },
    "accent_color": {
      "type": "string",
      "default": "#39FF14",
      "description": "Cor de acento (neon)"
    },
    "plan": {
      "type": "string",
      "enum": [
        "starter",
        "pro",
        "agency"
      ],
      "default": "starter",
      "description": "Plano contratado"
    },
    "trial_ends_at": {
      "type": "string",
      "format": "date-time",
      "description": "Data de t\u00e9rmino do trial"
    },
    "subscription_status": {
      "type": "string",
      "enum": [
        "trial",
        "active",
        "expired",
        "cancelled"
      ],
      "default": "trial"
    },
    "max_clients": {
      "type": "number",
      "default": 15
    },
    "max_users": {
      "type": "number",
      "default": 1
    }
  },
  "required": [
    "agency_name"
  ]
}