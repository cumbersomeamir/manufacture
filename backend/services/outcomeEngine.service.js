import { buildShouldCostModel } from "./shouldCost.service.js";
import { buildManufacturingVariants } from "./variants.service.js";
import { buildStructuredRfqContract } from "./rfqContract.service.js";
import { runAwardGate } from "./awardGate.service.js";
import { computeProjectOutcomeMetrics } from "./outcomeMetrics.service.js";

function ensureOutcomeEngine(project) {
  if (!project.outcomeEngine || typeof project.outcomeEngine !== "object") {
    project.outcomeEngine = {};
  }
  if (!project.outcomeEngine.followUpPolicy) {
    project.outcomeEngine.followUpPolicy = {
      responseSlaHours: 24,
      cadenceHours: 24,
      maxFollowUps: 2,
    };
  }
}

export async function generateOutcomePlan({
  project,
  variantKey = "pilot",
}) {
  const shouldCost = await buildShouldCostModel({ project });
  const variants = await buildManufacturingVariants({ project, shouldCost });
  const structuredRfq = await buildStructuredRfqContract({
    project,
    shouldCost,
    variants,
    variantKey,
  });

  const nextProject = JSON.parse(JSON.stringify(project));
  ensureOutcomeEngine(nextProject);
  nextProject.outcomeEngine.shouldCost = shouldCost;
  nextProject.outcomeEngine.variants = variants;
  nextProject.outcomeEngine.structuredRfq = structuredRfq;
  nextProject.outcomeEngine.lastOutcomePlanAt = new Date().toISOString();
  nextProject.outcomeEngine.kpiSnapshot = computeProjectOutcomeMetrics(nextProject);

  return {
    shouldCost,
    variants,
    structuredRfq,
    kpiSnapshot: nextProject.outcomeEngine.kpiSnapshot,
    outcomeEngine: nextProject.outcomeEngine,
  };
}

export async function generateStructuredRfqOnly({
  project,
  variantKey = "pilot",
}) {
  const shouldCost = project?.outcomeEngine?.shouldCost || (await buildShouldCostModel({ project }));
  const variants = project?.outcomeEngine?.variants || (await buildManufacturingVariants({ project, shouldCost }));
  const structuredRfq = await buildStructuredRfqContract({
    project,
    shouldCost,
    variants,
    variantKey,
  });

  return {
    shouldCost,
    variants,
    structuredRfq,
  };
}

export function computeOutcomeMetrics(project) {
  return computeProjectOutcomeMetrics(project);
}

export function evaluateAwardGate(project, weights) {
  return runAwardGate({
    project,
    weights,
  });
}
