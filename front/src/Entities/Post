{
  "name": "Post",
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
    "caption": {
      "type": "string",
      "description": "Legenda do post"
    },
    "media_url": {
      "type": "string",
      "description": "URL da imagem/v\u00eddeo"
    },
    "media_type": {
      "type": "string",
      "enum": [
        "image",
        "video",
        "carousel"
      ],
      "default": "image"
    },
    "cta": {
      "type": "string",
      "description": "Call to action"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "status": {
      "type": "string",
      "enum": [
        "idea",
        "production",
        "editing",
        "pending_approval",
        "approved",
        "scheduled",
        "published",
        "rejected"
      ],
      "default": "idea"
    },
    "scheduled_date": {
      "type": "string",
      "format": "date-time"
    },
    "published_date": {
      "type": "string",
      "format": "date-time"
    },
    "client_feedback": {
      "type": "string",
      "description": "Coment\u00e1rio do cliente"
    },
    "version": {
      "type": "number",
      "default": 1
    },
    "history": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "date": {
            "type": "string"
          },
          "action": {
            "type": "string"
          },
          "user": {
            "type": "string"
          },
          "comment": {
            "type": "string"
          }
        }
      }
    }
  },
  "required": [
    "tenant_id",
    "client_id",
    "title"
  ]
}