import { createConversationModel } from "../models/Conversation.js";
import { isSmtpConfigured, sendEmail } from "../lib/email/smtpClient.js";

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function hoursSince(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return (Date.now() - date.getTime()) / 36e5;
}

function hasInboundReply(project, supplierId) {
  return (project.conversations || []).some(
    (entry) => entry.supplierId === supplierId && entry.direction === "inbound",
  );
}

function getLastOutbound(project, supplierId) {
  const events = (project.conversations || [])
    .filter((entry) => entry.supplierId === supplierId && entry.direction === "outbound")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return events[0] || null;
}

function getFollowUpCount(project, supplierId) {
  return (project.conversations || []).filter(
    (entry) =>
      entry.supplierId === supplierId &&
      entry.direction === "outbound" &&
      entry.metadata?.source === "followup",
  ).length;
}

function buildFollowUpBody({ project, supplier, followUpIndex }) {
  const product = project?.productDefinition?.productName || project?.name || "product";
  const moq = project?.constraints?.moqTolerance || "as discussed";
  return [
    `Hi ${supplier.contactPerson || "team"},`,
    "",
    `Quick follow-up on our RFQ for ${product}.`,
    "",
    "Could you please share:",
    "- Unit pricing (with MOQ tiers)",
    "- MOQ and sample feasibility",
    "- Sample + production lead times",
    "- Tooling / NRE (if any)",
    "",
    `Our target MOQ range is ${moq}.`,
    `This is follow-up #${followUpIndex}.`,
    "",
    "If helpful, we can confirm requirements in a short call this week.",
    "",
    "Best regards,",
    project.name,
  ].join("\n");
}

export async function sendSupplierFollowUps({
  projectId,
  project,
  responseSlaHours = 24,
  cadenceHours = 24,
  maxFollowUps = 2,
}) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured. Set SMTP credentials before running follow-ups.");
  }

  const sentConversations = [];
  const failures = [];
  let eligibleCount = 0;

  for (const supplier of project.suppliers || []) {
    if (!normalizeEmail(supplier.email)) continue;
    if (hasInboundReply(project, supplier.id)) continue;
    if (!["contacted", "identified", "outreach_failed"].includes(String(supplier.status || ""))) continue;

    const lastOutbound = getLastOutbound(project, supplier.id);
    if (!lastOutbound) continue;

    const followUpsSent = getFollowUpCount(project, supplier.id);
    if (followUpsSent >= maxFollowUps) continue;

    const thresholdHours = responseSlaHours + followUpsSent * cadenceHours;
    if (hoursSince(lastOutbound.createdAt) < thresholdHours) continue;

    eligibleCount += 1;
    const followUpIndex = followUpsSent + 1;
    const subject = `Follow-up #${followUpIndex}: RFQ ${project.productDefinition?.productName || project.name}`;
    const body = buildFollowUpBody({
      project,
      supplier,
      followUpIndex,
    });

    try {
      const result = await sendEmail({
        to: supplier.email,
        subject,
        text: body,
      });

      sentConversations.push(
        createConversationModel({
          projectId,
          supplierId: supplier.id,
          direction: "outbound",
          channel: "email",
          subject,
          message: body,
          metadata: {
            source: "followup",
            followUpIndex,
            to: supplier.email,
            provider: "smtp",
            providerMessageId: result.messageId,
            status: "sent",
          },
        }),
      );
    } catch (error) {
      failures.push({
        supplierId: supplier.id,
        reason: error instanceof Error ? error.message : "Follow-up send failed",
      });
    }
  }

  return {
    eligibleCount,
    sentConversations,
    failures,
  };
}
