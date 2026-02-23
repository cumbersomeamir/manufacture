import { randomUUID } from "crypto";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseTargetMoq(project) {
  const raw = String(project?.constraints?.moqTolerance || "");
  const nums = raw.match(/\d+(?:\.\d+)?/g) || [];
  if (!nums.length) return 500;
  return Number(nums[0]);
}

function getShouldCostLanded(project) {
  const landed = Number(project?.outcomeEngine?.shouldCost?.costBreakdown?.landedUnitCostUsd);
  return Number.isFinite(landed) ? landed : 12;
}

function importMultiplier(supplier, projectCountry) {
  const supplierCountry = String(supplier?.country || "").toLowerCase();
  const target = String(projectCountry || "").toLowerCase();
  if (supplierCountry && target && supplierCountry === target) return 1.08;

  const distance = String(supplier?.distanceComplexity || "").toLowerCase();
  if (distance === "low") return 1.1;
  if (distance === "medium") return 1.16;
  return 1.24;
}

function riskScoreFromFlags(flags = []) {
  const count = Array.isArray(flags) ? flags.length : 0;
  return clamp(1 - count * 0.12, 0.15, 1);
}

function buildSamplePo({ project, supplier, rankingEntry }) {
  const targetMoq = parseTargetMoq(project);
  const sampleQty = Math.max(20, Math.min(200, Math.round(targetMoq * 0.1)));
  const unitPrice = Number.isFinite(supplier?.pricing?.unitPrice)
    ? supplier.pricing.unitPrice
    : rankingEntry.landedUnitCostUsd;
  const tooling = Number.isFinite(supplier?.toolingCost) ? supplier.toolingCost : 0;

  return {
    poId: `SAMPLE-${randomUUID().slice(0, 8).toUpperCase()}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    issueDate: new Date().toISOString(),
    currency: supplier?.pricing?.currency || "USD",
    sampleQuantityUnits: sampleQty,
    unitPriceUsd: Number(unitPrice.toFixed(2)),
    toolingCostUsd: Number(tooling.toFixed(2)),
    estimatedTotalUsd: Number((sampleQty * unitPrice + tooling).toFixed(2)),
    incoterm: "EXW",
    paymentTerms: "30% deposit / 70% before shipment",
    requiredDocs: [
      "Proforma invoice",
      "BOM revision list",
      "QC test report format",
      "Packaging spec confirmation",
    ],
    acceptanceCriteria: [
      "Functional pass rate >= 98% on agreed test plan",
      "Critical dimensions within tolerance",
      "No unresolved cosmetic defects on A-surface",
    ],
    nextActions: [
      "Confirm quote validity and lead time in writing",
      "Approve sample build start date",
      "Lock communication channel and owner on supplier side",
    ],
  };
}

export function runAwardGate({ project, weights = {} }) {
  const suppliers = Array.isArray(project?.suppliers) ? project.suppliers : [];
  if (!suppliers.length) {
    throw new Error("No suppliers available for award decision.");
  }

  const shouldCostLanded = getShouldCostLanded(project);
  const targetMoq = parseTargetMoq(project);
  const projectCountry = project?.constraints?.country || "United States";

  const rows = suppliers.map((supplier) => {
    const quoted = Number(supplier?.pricing?.unitPrice);
    const baseUnit = Number.isFinite(quoted) ? quoted : shouldCostLanded;
    const landedUnitCostUsd = Number((baseUnit * importMultiplier(supplier, projectCountry)).toFixed(4));
    const leadTimeDays = Number.isFinite(supplier?.leadTimeDays) ? supplier.leadTimeDays : 45;
    const moq = Number.isFinite(supplier?.moq) ? supplier.moq : targetMoq * 2;
    const confidence = Number.isFinite(supplier?.confidenceScore) ? supplier.confidenceScore : 0.45;
    const riskScore = riskScoreFromFlags(supplier?.riskFlags);

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      landedUnitCostUsd,
      leadTimeDays,
      moq,
      confidence,
      riskScore,
      quotedUnitCostUsd: Number.isFinite(quoted) ? quoted : null,
      toolingCostUsd: Number.isFinite(supplier?.toolingCost) ? supplier.toolingCost : null,
      reasons: [
        Number.isFinite(quoted) ? "Supplier provided explicit unit quote." : "Used should-cost fallback for missing quote.",
        `Import factor applied: ${importMultiplier(supplier, projectCountry).toFixed(2)}x`,
      ],
    };
  });

  const landedValues = rows.map((row) => row.landedUnitCostUsd);
  const minCost = Math.min(...landedValues);
  const maxCost = Math.max(...landedValues);

  const costWeight = Number.isFinite(weights.cost) ? weights.cost : 0.45;
  const leadWeight = Number.isFinite(weights.lead) ? weights.lead : 0.2;
  const moqWeight = Number.isFinite(weights.moq) ? weights.moq : 0.15;
  const confidenceWeight = Number.isFinite(weights.confidence) ? weights.confidence : 0.1;
  const riskWeight = Number.isFinite(weights.risk) ? weights.risk : 0.1;

  const ranking = rows
    .map((row) => {
      const costScore = maxCost === minCost ? 1 : 1 - (row.landedUnitCostUsd - minCost) / (maxCost - minCost);
      const leadScore = clamp((60 - row.leadTimeDays) / 45, 0, 1);
      const moqScore = clamp(1 - Math.max(0, row.moq - targetMoq) / Math.max(targetMoq, 1), 0, 1);
      const totalScore =
        costScore * costWeight +
        leadScore * leadWeight +
        moqScore * moqWeight +
        row.confidence * confidenceWeight +
        row.riskScore * riskWeight;

      return {
        ...row,
        scoreBreakdown: {
          costScore: Number(costScore.toFixed(4)),
          leadScore: Number(leadScore.toFixed(4)),
          moqScore: Number(moqScore.toFixed(4)),
          confidenceScore: Number(row.confidence.toFixed(4)),
          riskScore: Number(row.riskScore.toFixed(4)),
        },
        totalScore: Number((totalScore * 100).toFixed(2)),
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  const recommended = ranking[0];
  const supplier = suppliers.find((entry) => entry.id === recommended.supplierId) || suppliers[0];
  const samplePo = buildSamplePo({ project, supplier, rankingEntry: recommended });

  return {
    generatedAt: new Date().toISOString(),
    objective: "Minimize landed cost + delay while keeping supplier execution risk bounded.",
    recommendedSupplierId: recommended.supplierId,
    recommended,
    ranking,
    samplePo,
    rationale: [
      "Award gate ranks suppliers with weighted landed cost, lead-time, MOQ, confidence, and risk.",
      "Ranking is deterministic and reproducible for audit.",
      "Sample PO packet is generated to reduce idea-to-order delay.",
    ],
  };
}
