import nodemailer from "nodemailer";

let transporter = null;

function readSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 0),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
    replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_USER || "",
  };
}

export function isSmtpConfigured() {
  const cfg = readSmtpConfig();
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.from);
}

function getTransporter() {
  if (transporter) return transporter;

  const cfg = readSmtpConfig();
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.");
  }

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });

  return transporter;
}

export async function verifySmtpConnection() {
  const tx = getTransporter();
  await tx.verify();
  return true;
}

export async function sendEmail({ to, subject, text, html = "", headers = {} }) {
  const cfg = readSmtpConfig();
  const tx = getTransporter();

  const result = await tx.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    html: html || undefined,
    replyTo: cfg.replyTo || undefined,
    headers,
  });

  return {
    messageId: result.messageId,
    accepted: result.accepted || [],
    rejected: result.rejected || [],
    response: result.response || "",
  };
}
