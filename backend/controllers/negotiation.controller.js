import { runNegotiationAgent } from "../agents/negotiation.agent.js";
import { createConversationModel } from "../models/Conversation.js";
import { sendEmail } from "../lib/email/smtpClient.js";
import { getProjectById, patchProject } from "../store/project.store.js";
import { setChecklistItem, setModuleStatus } from "../services/projectState.service.js";
import { CHECKLIST_KEYS } from "../services/checklist.service.js";

export async function generateNegotiationHandler(req, res) {
  const { projectId } = req.params;
  const { supplierId, target = {}, sendEmail: shouldSendEmail = true } = req.body || {};

  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const supplier = project.suppliers.find((entry) => entry.id === supplierId) ||
    project.suppliers.find((entry) => entry.selected) ||
    project.suppliers[0];

  if (!supplier) {
    return res.status(400).json({ error: "No supplier available for negotiation" });
  }

  try {
    const draft = await runNegotiationAgent({
      project,
      supplier,
      target,
    });

    let delivery = {
      status: "draft_only",
      providerMessageId: null,
      error: null,
    };

    if (shouldSendEmail && supplier.email) {
      try {
        const sent = await sendEmail({
          to: supplier.email,
          subject: draft.subject,
          text: draft.body,
        });
        delivery = {
          status: "sent",
          providerMessageId: sent.messageId,
          error: null,
        };
      } catch (error) {
        delivery = {
          status: "failed",
          providerMessageId: null,
          error: error instanceof Error ? error.message : "Unknown email error",
        };
      }
    }

    const message = createConversationModel({
      projectId,
      supplierId: supplier.id,
      direction: "outbound",
      channel: "email",
      subject: draft.subject,
      message: draft.body,
      metadata: {
        source: "negotiation",
        to: supplier.email || "",
        status: delivery.status,
        providerMessageId: delivery.providerMessageId,
        error: delivery.error,
      },
    });

    const updated = await patchProject(projectId, (editable) => {
      editable.conversations.unshift(message);
      editable.moduleStatus.negotiation = "validated";
      setChecklistItem(
        editable,
        CHECKLIST_KEYS.NEGOTIATION,
        "validated",
        `Negotiation draft generated for ${supplier.name}.`,
      );

      const selectionStep = editable.checklist.find((entry) => entry.key === CHECKLIST_KEYS.MANUFACTURER_SELECTION);
      if (selectionStep && selectionStep.status === "pending") {
        selectionStep.status = "in_progress";
        selectionStep.evidence = "Negotiation round started. Review final terms before locking supplier.";
        selectionStep.updatedAt = new Date().toISOString();
      }

      setModuleStatus(editable, "success", "in_progress");
      return editable;
    });

    return res.json({
      draft,
      supplier,
      delivery,
      project: updated,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to generate negotiation draft",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
