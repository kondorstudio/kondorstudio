{
  "name": "Creative",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string"
    },
    "client_id": {
      "type": "string"
    },
    "post_id": {
      "type": "string",
      "description": "Post vinculado (opcional)"
    },
    "name": {
      "type": "string",
      "description": "Nome do criativo"
    },
    "file_url": {
      "type": "string",
      "description": "URL do arquivo"
    },
    "file_type": {
      "type": "string",
      "enum": [
        "image",
        "video",
        "gif"
      ],
      "default": "image"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags do criativo"
    },
    "performance_score": {
      "type": "number",
      "description": "Score de performance (0-100)"
    },
    "impressions": {
      "type": "number",
      "default": 0
    },
    "clicks": {
      "type": "number",
      "default": 0
    },
    "ctr": {
      "type": "number",
      "description": "Click-through rate"
    },
    "notes": {
      "type": "string"
    }
  },
  "required": [
    "tenant_id",
    "name",
    "file_url"
  ]
}