{
  "name": "Task",
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
    "description": {
      "type": "string"
    },
    "assigned_to": {
      "type": "string",
      "description": "Email do membro da equipe"
    },
    "due_date": {
      "type": "string",
      "format": "date"
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "urgent"
      ],
      "default": "medium"
    },
    "status": {
      "type": "string",
      "enum": [
        "todo",
        "in_progress",
        "review",
        "done"
      ],
      "default": "todo"
    },
    "checklist": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string"
          },
          "completed": {
            "type": "boolean"
          }
        }
      }
    },
    "comments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "user": {
            "type": "string"
          },
          "text": {
            "type": "string"
          },
          "date": {
            "type": "string"
          }
        }
      }
    }
  },
  "required": [
    "tenant_id",
    "title"
  ]
}