{
  "name": "Approval",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string"
    },
    "post_id": {
      "type": "string"
    },
    "client_id": {
      "type": "string"
    },
    "approver_name": {
      "type": "string",
      "description": "Nome do aprovador"
    },
    "approver_contact": {
      "type": "string",
      "description": "Email ou WhatsApp do aprovador"
    },
    "channel": {
      "type": "string",
      "enum": [
        "whatsapp",
        "email",
        "portal",
        "manual"
      ],
      "default": "manual",
      "description": "Canal de aprova\u00e7\u00e3o"
    },
    "status": {
      "type": "string",
      "enum": [
        "pending",
        "approved",
        "rejected"
      ],
      "default": "pending"
    },
    "feedback": {
      "type": "string",
      "description": "Feedback do aprovador"
    },
    "approved_at": {
      "type": "string",
      "format": "date-time",
      "description": "Data/hora da aprova\u00e7\u00e3o"
    },
    "whatsapp_sent": {
      "type": "boolean",
      "default": false
    }
  },
  "required": [
    "tenant_id",
    "post_id",
    "client_id",
    "approver_contact"
  ]
}