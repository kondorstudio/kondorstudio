const express = require("express");
const router = express.Router();

/**
 * Verificação do webhook (Meta)
 * GET /api/webhooks/whatsapp/meta
 */
router.get("/meta", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/**
 * Eventos do WhatsApp (mensagens, status etc.)
 * POST /api/webhooks/whatsapp/meta
 */
router.post(
  "/meta",
  express.json({ type: "*/*" }),
  (req, res) => {
    res.sendStatus(200);

    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (!value?.messages?.length) return;

      const message = value.messages[0];

      const parsedMessage = {
        from: message.from,
        messageId: message.id,
        type: message.type,
        text: message.text?.body || null,
        timestamp: message.timestamp,
        phoneNumberId: value.metadata?.phone_number_id || null,
      };

      console.log("📩 WhatsApp message parsed:", parsedMessage);
    } catch (err) {
      console.error("❌ Error parsing WhatsApp webhook:", err);
    }
  }
);

module.exports = router;
