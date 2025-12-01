{
  "name": "Report",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string"
    },
    "client_id": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "period_start": {
      "type": "string",
      "format": "date"
    },
    "period_end": {
      "type": "string",
      "format": "date"
    },
    "type": {
      "type": "string",
      "enum": [
        "weekly",
        "monthly",
        "custom"
      ],
      "default": "monthly"
    },
    "summary": {
      "type": "object",
      "properties": {
        "total_spend": {
          "type": "number"
        },
        "total_conversions": {
          "type": "number"
        },
        "avg_roas": {
          "type": "number"
        },
        "top_campaign": {
          "type": "string"
        }
      }
    },
    "pdf_url": {
      "type": "string",
      "description": "URL do PDF gerado"
    },
    "sent_whatsapp": {
      "type": "boolean",
      "default": false
    },
    "sent_email": {
      "type": "boolean",
      "default": false
    },
    "auto_generated": {
      "type": "boolean",
      "default": false
    }
  },
  "required": [
    "tenant_id",
    "client_id",
    "title"
  ]
}