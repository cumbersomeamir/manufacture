import axios from "axios";

function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    from: process.env.TWILIO_WHATSAPP_FROM || "",
    verifyToken: process.env.TWILIO_WEBHOOK_VERIFY_TOKEN || "",
  };
}

export function isTwilioConfigured() {
  const cfg = getTwilioConfig();
  return Boolean(cfg.accountSid && cfg.authToken && cfg.from);
}

export function normalizeWhatsAppTo(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  if (text.startsWith("whatsapp:+") && /^whatsapp:\+\d{10,15}$/.test(text)) {
    return text;
  }

  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return "";

  const normalized = digits.length === 10 ? `91${digits}` : digits;
  if (!/^\d{10,15}$/.test(normalized)) return "";
  return `whatsapp:+${normalized}`;
}

export async function sendWhatsAppMessage({ to, body }) {
  const cfg = getTwilioConfig();
  if (!isTwilioConfigured()) {
    throw new Error("Twilio WhatsApp is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM.");
  }

  const toNormalized = normalizeWhatsAppTo(to);
  if (!toNormalized) {
    throw new Error("Invalid WhatsApp destination number. Expected E.164 format.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const payload = new URLSearchParams({
    To: toNormalized,
    From: cfg.from,
    Body: String(body || "").slice(0, 1500),
  });

  const response = await axios.post(url, payload.toString(), {
    auth: {
      username: cfg.accountSid,
      password: cfg.authToken,
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 15000,
  });

  return {
    sid: response.data?.sid || "",
    status: response.data?.status || "queued",
    to: response.data?.to || toNormalized,
    from: response.data?.from || cfg.from,
  };
}

export function verifyWebhookToken(headers = {}, body = {}) {
  const cfg = getTwilioConfig();
  if (!cfg.verifyToken) return true;

  const headerToken = headers["x-webhook-token"] || headers["X-Webhook-Token"];
  const bodyToken = body.verifyToken || body.token;
  return String(headerToken || bodyToken || "") === String(cfg.verifyToken);
}

export function parseTwilioInbound(body = {}) {
  const from = String(body.From || "").trim();
  const to = String(body.To || "").trim();
  const message = String(body.Body || "").trim();

  return {
    from,
    to,
    message,
    messageSid: String(body.MessageSid || ""),
    profileName: String(body.ProfileName || ""),
    timestamp: new Date().toISOString(),
  };
}
