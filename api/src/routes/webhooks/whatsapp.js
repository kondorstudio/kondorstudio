const express = require("express");
const router = express.Router();

/**
 * Envia mensagem de texto via WhatsApp Cloud API
 */
async function sendWhatsAppText({ to, body, phoneNumberId }) {
  const token = process.env.WHATSAPP_META_TOKEN;
  const pnid = phoneNumberId || process.env.WHATSAPP_META_PHONE_NUMBER_ID;

  if (!token) throw new Error("WHATSAPP_META_TOKEN não configurado");
  if (!pnid) throw new Error("WHATSAPP_META_PHONE_NUMBER_ID não configurado");

  const url = `https://graph.facebook.com/v22.0/${pnid}/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const msg =
      data?.error?.message ||
      `Falha ao enviar WhatsApp (HTTP ${resp.status})`;
    throw new Error(msg);
  }

  return data;
}

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
router.post("/meta", express.json({ type: "*/*" }), (req, res) => {
  // responde rápido pro Meta não tentar de novo
  res.sendStatus(200);

  // processa “em background” dentro do request
  setImmediate(async () => {
    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      // Ignora eventos que não são mensagens recebidas
      if (!value?.messages?.length) return;

      const message = value.messages[0];

      // Ignora se não for mensagem “real” (ex.: não tem from)
      if (!message?.from) return;

      const parsedMessage = {
        from: message.from,
        messageId: message.id,
        type: message.type,
        text: message.text?.body || null,
        timestamp: message.timestamp,
        phoneNumberId: value.metadata?.phone_number_id || null,
        contactName: value.contacts?.[0]?.profile?.name || null,
      };

      console.log("✅ WhatsApp message parsed:", parsedMessage);

      // ======= RESPOSTA AUTOMÁTICA (primeiro teste) =======
      // responde somente quando vier texto
      if (parsedMessage.type === "text") {
        const replyText = `Recebi sua mensagem ✅\n\nMensagem: "${parsedMessage.text || ""}"`;

        const sent = await sendWhatsAppText({
          to: parsedMessage.from, // responde para quem enviou
          body: replyText,
          phoneNumberId: parsedMessage.phoneNumberId, // usa o phone_number_id do evento (melhor)
        });

        console.log("📤 WhatsApp reply sent:", sent);
      }
    } catch (err) {
      console.error("❌ Error handling WhatsApp webhook:", err?.message || err);
    }
  });
});

module.exports = router;
