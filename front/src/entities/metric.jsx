{
  "name": "Metric",
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
        "facebook"
      ],
      "description": "Plataforma de origem"
    },
    "date": {
      "type": "string",
      "format": "date"
    },
    "impressions": {
      "type": "number",
      "default": 0
    },
    "clicks": {
      "type": "number",
      "default": 0
    },
    "conversions": {
      "type": "number",
      "default": 0
    },
    "spend": {
      "type": "number",
      "default": 0
    },
    "revenue": {
      "type": "number",
      "default": 0
    },
    "ctr": {
      "type": "number",
      "description": "Click-through rate"
    },
    "cpc": {
      "type": "number",
      "description": "Cost per click"
    },
    "cpl": {
      "type": "number",
      "description": "Cost per lead"
    },
    "roas": {
      "type": "number",
      "description": "Return on ad spend"
    },
    "reach": {
      "type": "number"
    },
    "engagement": {
      "type": "number"
    }
  },
  "required": [
    "tenant_id",
    "client_id",
    "platform",
    "date"
  ]
}