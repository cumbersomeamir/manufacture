import { getProjectById, patchProject } from "../store/project.store.js";
import {
  computeOutcomeMetrics,
  evaluateAwardGate,
  generateOutcomePlan,
  generateStructuredRfqOnly,
} from "../services/outcomeEngine.service.js";

function ensureOutcomeEngine(draft) {
  if (!draft.outcomeEngine || typeof draft.outcomeEngine !== "object") {
    draft.outcomeEngine = {};
  }
  if (!draft.outcomeEngine.followUpPolicy) {
    draft.outcomeEngine.followUpPolicy = {
      responseSlaHours: 24,
      cadenceHours: 24,
      maxFollowUps: 2,
    };
  }
}

export async function generateOutcomePlanHandler(req, res) {
  const { projectId } = req.params;
  const { variantKey = "pilot" } = req.body || {};

  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const outcome = await generateOutcomePlan({
      project,
      variantKey,
    });

    const updated = await patchProject(projectId, (draft) => {
      ensureOutcomeEngine(draft);
      draft.outcomeEngine.shouldCost = outcome.shouldCost;
      draft.outcomeEngine.variants = outcome.variants;
      draft.outcomeEngine.structuredRfq = outcome.structuredRfq;
      draft.outcomeEngine.kpiSnapshot = outcome.kpiSnapshot;
      draft.outcomeEngine.lastOutcomePlanAt = new Date().toISOString();
      return draft;
    });

    return res.json({
      project: updated,
      outcome,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to generate outcome plan",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function generateStructuredRfqHandler(req, res) {
  const { projectId } = req.params;
  const { variantKey = "pilot" } = req.body || {};

  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const outcome = await generateStructuredRfqOnly({
      project,
      variantKey,
    });

    const updated = await patchProject(projectId, (draft) => {
      ensureOutcomeEngine(draft);
      draft.outcomeEngine.shouldCost = outcome.shouldCost;
      draft.outcomeEngine.variants = outcome.variants;
      draft.outcomeEngine.structuredRfq = outcome.structuredRfq;
      draft.outcomeEngine.kpiSnapshot = computeOutcomeMetrics(draft);
      return draft;
    });

    return res.json({
      project: updated,
      structuredRfq: outcome.structuredRfq,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to generate structured RFQ",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function runAwardGateHandler(req, res) {
  const { projectId } = req.params;
  const { weights = {}, autoSelect = false } = req.body || {};

  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const decision = evaluateAwardGate(project, weights);

    const updated = await patchProject(projectId, (draft) => {
      ensureOutcomeEngine(draft);
      draft.outcomeEngine.awardDecision = decision;

      if (autoSelect && decision.recommendedSupplierId) {
        draft.suppliers = draft.suppliers.map((supplier) => ({
          ...supplier,
          selected: supplier.id === decision.recommendedSupplierId,
          status: supplier.id === decision.recommendedSupplierId
            ? (supplier.status === "finalized" ? "finalized" : "selected")
            : supplier.status,
          updatedAt: new Date().toISOString(),
        }));
      }

      draft.outcomeEngine.kpiSnapshot = computeOutcomeMetrics(draft);
      return draft;
    });

    return res.json({
      project: updated,
      decision,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (/No suppliers available/i.test(message)) {
      return res.status(400).json({
        error: "Award gate requires suppliers",
        message,
      });
    }
    return res.status(500).json({
      error: "Failed to run award gate",
      message,
    });
  }
}

export async function getOutcomeMetricsHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const metrics = computeOutcomeMetrics(project);
    const updated = await patchProject(projectId, (draft) => {
      ensureOutcomeEngine(draft);
      draft.outcomeEngine.kpiSnapshot = metrics;
      return draft;
    });

    return res.json({
      project: updated,
      metrics,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to compute outcome metrics",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
