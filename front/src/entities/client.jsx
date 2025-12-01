{
  "name": "Client",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "ID da ag\u00eancia"
    },
    "name": {
      "type": "string",
      "description": "Nome do cliente"
    },
    "sector": {
      "type": "string",
      "description": "Setor/nicho do cliente"
    },
    "logo_url": {
      "type": "string"
    },
    "website": {
      "type": "string"
    },
    "instagram": {
      "type": "string"
    },
    "facebook": {
      "type": "string"
    },
    "tiktok": {
      "type": "string"
    },
    "briefing": {
      "type": "string",
      "description": "Briefing do cliente"
    },
    "monthly_value": {
      "type": "number",
      "description": "Valor mensal pago"
    },
    "renewal_date": {
      "type": "string",
      "format": "date"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "internal_notes": {
      "type": "string",
      "description": "Notas internas (senhas, acessos, etc)"
    },
    "status": {
      "type": "string",
      "enum": [
        "active",
        "paused",
        "cancelled"
      ],
      "default": "active"
    },
    "portal_email": {
      "type": "string",
      "description": "Email de acesso do cliente ao portal"
    },
    "portal_password": {
      "type": "string",
      "description": "Senha de acesso ao portal"
    }
  },
  "required": [
    "tenant_id",
    "name"
  ]
}