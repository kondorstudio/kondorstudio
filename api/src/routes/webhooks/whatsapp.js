const crypto = require("crypto");
const express = require("express");
const router = express.Router();

const { prisma } = require("../../prisma");

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
router.post("/meta", express.json({ type: "*/*" }), async (req, res) => {
  // IMPORTANTE: responder rápido pra Meta não re-tentar
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) return;

    // === Mensagens recebidas ===
    if (value.messages?.length) {
      const message = value.messages[0];

      const parsedMessage = {
        from: message.from,
        messageId: message.id,
        type: message.type,
        text: message.text?.body || null,
        timestamp: message.timestamp,
        phoneNumberId: value.metadata?.phone_number_id || null,
        contactName: value.contacts?.[0]?.profile?.name || null,
      };

      // Salva no banco (tabela criada via SQL no server.js)
      const id = crypto.randomUUID();

      await prisma.$executeRaw`
        INSERT INTO "whatsapp_messages"
          ("id", "tenantId", "from", "waMessageId", "phoneNumberId", "type", "textBody", "rawPayload")
        VALUES
          (${id}, ${null}, ${parsedMessage.from}, ${parsedMessage.messageId}, ${parsedMessage.phoneNumberId}, ${parsedMessage.type}, ${parsedMessage.text}, ${req.body})
        ON CONFLICT ("waMessageId") DO NOTHING;
      `;

      console.log("✅ WhatsApp message parsed:", parsedMessage);
      console.log("💾 WhatsApp message saved:", {
        waMessageId: parsedMessage.messageId,
        from: parsedMessage.from,
      });
      return;
    }

    // === Status de entrega/leitura (se você assinar 'statuses'/'message_status') ===
    if (value.statuses?.length) {
      const status = value.statuses[0];

      const parsedStatus = {
        messageId: status.id,
        status: status.status, // sent, delivered, read, failed
        timestamp: status.timestamp,
        recipientId: status.recipient_id,
        phoneNumberId: value.metadata?.phone_number_id || null,
      };

      console.log("✅ WhatsApp status parsed:", parsedStatus);
      return;
    }

    // Outros eventos (ignorar por enquanto)
  } catch (err) {
    console.error("❌ Error handling WhatsApp webhook:", err);
  }
});

module.exports = router;
