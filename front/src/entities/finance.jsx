{
  "name": "Finance",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string"
    },
    "client_id": {
      "type": "string",
      "description": "ID do cliente (opcional)"
    },
    "type": {
      "type": "string",
      "enum": [
        "revenue",
        "expense"
      ],
      "description": "Tipo de transa\u00e7\u00e3o"
    },
    "amount": {
      "type": "number",
      "description": "Valor da transa\u00e7\u00e3o"
    },
    "currency": {
      "type": "string",
      "default": "BRL",
      "enum": [
        "BRL",
        "USD",
        "EUR"
      ]
    },
    "category": {
      "type": "string",
      "description": "Categoria da transa\u00e7\u00e3o"
    },
    "date": {
      "type": "string",
      "format": "date",
      "description": "Data da transa\u00e7\u00e3o"
    },
    "notes": {
      "type": "string",
      "description": "Observa\u00e7\u00f5es"
    },
    "invoice_url": {
      "type": "string",
      "description": "URL da nota fiscal/documento"
    }
  },
  "required": [
    "tenant_id",
    "type",
    "amount",
    "date"
  ]
}