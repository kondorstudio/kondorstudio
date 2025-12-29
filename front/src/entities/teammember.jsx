{
  "name": "TeamMember",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "email": {
      "type": "string"
    },
    "role": {
      "type": "string",
      "enum": [
        "admin",
        "traffic_manager",
        "designer",
        "social_media",
        "copywriter",
        "videomaker"
      ],
      "default": "social_media"
    },
    "avatar_url": {
      "type": "string"
    },
    "permissions": {
      "type": "object",
      "properties": {
        "modules": {
          "type": "object",
          "properties": {
            "dashboard": { "type": "boolean", "default": true },
            "clients": { "type": "boolean", "default": true },
            "posts": { "type": "boolean", "default": true },
            "approvals": { "type": "boolean", "default": true },
            "tasks": { "type": "boolean", "default": true },
            "metrics": { "type": "boolean", "default": false },
            "integrations": { "type": "boolean", "default": false },
            "finance": { "type": "boolean", "default": false },
            "library": { "type": "boolean", "default": true },
            "team": { "type": "boolean", "default": false },
            "settings": { "type": "boolean", "default": false }
          }
        },
        "clientAccess": {
          "type": "object",
          "properties": {
            "scope": { "type": "string", "default": "all" },
            "clientIds": { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    },
    "status": {
      "type": "string",
      "enum": [
        "active",
        "suspended"
      ],
      "default": "active"
    }
  },
  "required": [
    "tenant_id",
    "name",
    "email",
    "role"
  ]
}
