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
        "clients": {
          "type": "boolean",
          "default": true
        },
        "posts": {
          "type": "boolean",
          "default": true
        },
        "tasks": {
          "type": "boolean",
          "default": true
        },
        "metrics": {
          "type": "boolean",
          "default": false
        },
        "team": {
          "type": "boolean",
          "default": false
        },
        "settings": {
          "type": "boolean",
          "default": false
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