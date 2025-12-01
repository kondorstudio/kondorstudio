{
  "name": "Integration",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string"
    },
    "client_id": {
      "type": "string"
    },
    "platform": {
      "type": "string",
      "enum": [
        "meta_ads",
        "google_ads",
        "tiktok_ads",
        "instagram",
        "whatsapp",
        "google_analytics",
        "youtube"
      ],
      "description": "Plataforma integrada"
    },
    "status": {
      "type": "string",
      "enum": [
        "connected",
        "disconnected",
        "error"
      ],
      "default": "disconnected"
    },
    "access_token": {
      "type": "string",
      "description": "Token de acesso (criptografado)"
    },
    "refresh_token": {
      "type": "string"
    },
    "account_id": {
      "type": "string",
      "description": "ID da conta na plataforma"
    },
    "last_sync": {
      "type": "string",
      "format": "date-time"
    },
    "sync_frequency": {
      "type": "string",
      "enum": [
        "1h",
        "12h",
        "24h"
      ],
      "default": "24h"
    },
    "error_message": {
      "type": "string"
    }
  },
  "required": [
    "tenant_id",
    "platform"
  ]
}