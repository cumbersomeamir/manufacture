import { generateJsonWithFallback } from "./llm.service.js";

const REQUIRED_KEYS = ["prototype", "pilot", "scale"];

function fallbackVariants(shouldCost) {
  const landed = Number(shouldCost?.costBreakdown?.landedUnitCostUsd || 10);
  const tooling = Number(shouldCost?.costBreakdown?.toolingUsd || 4000);

  return [
    {
      key: "prototype",
      name: "Prototype Sprint",
      description: "Fastest path to first physical sample with minimal upfront tooling.",
      targetVolumeRange: "10-100 units",
      processStrategy: "Off-the-shelf components + rapid fabrication (3D print/CNC/manual assembly).",
      tooling: {
        type: "No hard tooling",
        costUsd: Number((tooling * 0.08).toFixed(2)),
        leadTimeDays: 5,
      },
      unitEconomics: {
        exWorksUnitCostUsd: Number((landed * 1.55).toFixed(2)),
        landedUnitCostUsd: Number((landed * 1.75).toFixed(2)),
      },
      timeline: {
        sampleDays: 7,
        productionDays: 14,
      },
      pros: ["Fast validation cycle", "Low commitment risk"],
      cons: ["Highest per-unit cost", "Not suitable for scale launch"],
      whenToUse: "Use when speed-to-first-demo is the priority.",
    },
    {
      key: "pilot",
      name: "Pilot Economics",
      description: "Balanced path between speed and unit economics for early market tests.",
      targetVolumeRange: "100-2,000 units",
      processStrategy: "Semi-custom parts + light tooling + standardized QA.",
      tooling: {
        type: "Soft tooling / fixture set",
        costUsd: Number((tooling * 0.45).toFixed(2)),
        leadTimeDays: 14,
      },
      unitEconomics: {
        exWorksUnitCostUsd: Number((landed * 1.1).toFixed(2)),
        landedUnitCostUsd: Number((landed * 1.22).toFixed(2)),
      },
      timeline: {
        sampleDays: 14,
        productionDays: 21,
      },
      pros: ["Good cost-to-speed balance", "Production-like quality signal"],
      cons: ["Still higher than full-scale costs"],
      whenToUse: "Use for first sellable batch and channel validation.",
    },
    {
      key: "scale",
      name: "Scale Optimization",
      description: "Lowest long-run unit cost with high upfront tooling commitment.",
      targetVolumeRange: "2,000+ units",
      processStrategy: "Custom components + hard tooling + automated assembly where possible.",
      tooling: {
        type: "Hard production tooling",
        costUsd: Number((tooling * 1.35).toFixed(2)),
        leadTimeDays: 35,
      },
      unitEconomics: {
        exWorksUnitCostUsd: Number((landed * 0.82).toFixed(2)),
        landedUnitCostUsd: Number((landed * 0.92).toFixed(2)),
      },
      timeline: {
        sampleDays: 28,
        productionDays: 35,
      },
      pros: ["Best landed unit cost", "Most defensible gross margin at volume"],
      cons: ["Highest capex and setup delay"],
      whenToUse: "Use after demand confidence and stable specs.",
    },
  ];
}

function normalizeVariant(candidate, fallback) {
  const tooling = candidate?.tooling || {};
  const economics = candidate?.unitEconomics || {};
  const timeline = candidate?.timeline || {};

  return {
    key: fallback.key,
    name: candidate?.name || fallback.name,
    description: candidate?.description || fallback.description,
    targetVolumeRange: candidate?.targetVolumeRange || fallback.targetVolumeRange,
    processStrategy: candidate?.processStrategy || fallback.processStrategy,
    tooling: {
      type: tooling.type || fallback.tooling.type,
      costUsd: Number.isFinite(tooling.costUsd) ? tooling.costUsd : fallback.tooling.costUsd,
      leadTimeDays: Number.isFinite(tooling.leadTimeDays) ? tooling.leadTimeDays : fallback.tooling.leadTimeDays,
    },
    unitEconomics: {
      exWorksUnitCostUsd:
        Number.isFinite(economics.exWorksUnitCostUsd)
          ? economics.exWorksUnitCostUsd
          : fallback.unitEconomics.exWorksUnitCostUsd,
      landedUnitCostUsd:
        Number.isFinite(economics.landedUnitCostUsd)
          ? economics.landedUnitCostUsd
          : fallback.unitEconomics.landedUnitCostUsd,
    },
    timeline: {
      sampleDays: Number.isFinite(timeline.sampleDays) ? timeline.sampleDays : fallback.timeline.sampleDays,
      productionDays:
        Number.isFinite(timeline.productionDays) ? timeline.productionDays : fallback.timeline.productionDays,
    },
    pros: Array.isArray(candidate?.pros) && candidate.pros.length ? candidate.pros : fallback.pros,
    cons: Array.isArray(candidate?.cons) && candidate.cons.length ? candidate.cons : fallback.cons,
    whenToUse: candidate?.whenToUse || fallback.whenToUse,
  };
}

function normalizeVariants(raw, fallback) {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.variants)
      ? raw.variants
      : [];
  const keyed = new Map(source.map((entry) => [String(entry?.key || "").toLowerCase(), entry]));

  return fallback.map((entry) => normalizeVariant(keyed.get(entry.key), entry));
}

export async function buildManufacturingVariants({ project, shouldCost }) {
  const fallback = fallbackVariants(shouldCost);
  const prompt = [
    "Generate exactly three manufacturing path variants for this product: prototype, pilot, scale.",
    "Return strict JSON as array with keys: key, name, description, targetVolumeRange, processStrategy, tooling, unitEconomics, timeline, pros, cons, whenToUse.",
    "tooling keys: type, costUsd, leadTimeDays.",
    "unitEconomics keys: exWorksUnitCostUsd, landedUnitCostUsd.",
    "timeline keys: sampleDays, productionDays.",
    "Each variant key must be one of: prototype, pilot, scale.",
    `Project idea: ${project.idea}`,
    `Product definition: ${JSON.stringify(project.productDefinition)}`,
    `Should-cost model: ${JSON.stringify(shouldCost)}`,
  ].join("\n\n");

  const generated = await generateJsonWithFallback({
    prompt,
    maxOutputTokens: 1300,
    fallback: () => fallback,
  });

  const normalized = normalizeVariants(generated, fallback);
  const keys = new Set(normalized.map((entry) => entry.key));
  if (!REQUIRED_KEYS.every((key) => keys.has(key))) {
    return fallback;
  }
  return normalized;
}
