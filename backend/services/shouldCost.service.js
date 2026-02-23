import { generateJsonWithFallback } from "./llm.service.js";

function inferProfile(project) {
  const text = [
    project.idea,
    project.productDefinition?.manufacturingCategory,
    ...(project.productDefinition?.keyMaterials || []),
  ]
    .join(" ")
    .toLowerCase();

  if (/(arduino|pcb|electronic|sensor|battery|speaker|mic|firmware|robot|bot)/.test(text)) {
    return "electronics";
  }
  if (/(bottle|kitchen|food|cup|container)/.test(text)) return "food_contact";
  if (/(bag|apparel|textile|fabric|shoe)/.test(text)) return "soft_goods";
  return "general_consumer";
}

function withExtCost(line) {
  const qty = Number(line.qtyPerUnit);
  const unit = Number(line.unitCostUsd);
  const ext = Number.isFinite(qty) && Number.isFinite(unit) ? Number((qty * unit).toFixed(4)) : null;
  return {
    ...line,
    qtyPerUnit: Number.isFinite(qty) ? qty : 1,
    unitCostUsd: Number.isFinite(unit) ? unit : 0,
    extCostUsd: ext,
    alternates: Array.isArray(line.alternates) ? line.alternates : [],
  };
}

function fallbackBomElectronics() {
  return [
    {
      component: "Control board (Arduino-compatible MCU)",
      specIntent: "Main logic, IO, and firmware runtime",
      qtyPerUnit: 1,
      unitCostUsd: 5.5,
      alternates: [
        { option: "A", supplierType: "Distributor", unitCostUsd: 5.5, note: "Branded board, faster validation" },
        { option: "B", supplierType: "EMS custom PCB", unitCostUsd: 3.2, note: "Cheaper at pilot volumes" },
      ],
      costDriver: "MCU selection and board form factor",
    },
    {
      component: "Audio output subsystem",
      specIntent: "Voice playback amp + speaker",
      qtyPerUnit: 1,
      unitCostUsd: 2.2,
      alternates: [
        { option: "A", supplierType: "Module vendor", unitCostUsd: 2.2, note: "Integrated amplifier module" },
        { option: "B", supplierType: "Discrete BOM", unitCostUsd: 1.6, note: "Lower cost but more assembly effort" },
      ],
      costDriver: "Acoustic output quality target",
    },
    {
      component: "Mic input subsystem",
      specIntent: "Voice capture front-end",
      qtyPerUnit: 1,
      unitCostUsd: 1.4,
      alternates: [
        { option: "A", supplierType: "MEMS vendor", unitCostUsd: 1.4, note: "Higher SNR MEMS" },
        { option: "B", supplierType: "Electret solution", unitCostUsd: 0.8, note: "Cheaper, lower consistency" },
      ],
      costDriver: "Noise floor requirements",
    },
    {
      component: "Power system",
      specIntent: "Battery/adapter, charging, protection",
      qtyPerUnit: 1,
      unitCostUsd: 3.1,
      alternates: [
        { option: "A", supplierType: "Battery pack OEM", unitCostUsd: 3.1, note: "Integrated protection board" },
        { option: "B", supplierType: "Adapter-only", unitCostUsd: 1.5, note: "No onboard battery" },
      ],
      costDriver: "Runtime and safety certification scope",
    },
    {
      component: "Enclosure (cover + cosmetic parts)",
      specIntent: "Mechanical protection and aesthetics",
      qtyPerUnit: 1,
      unitCostUsd: 2.9,
      alternates: [
        { option: "A", supplierType: "3D print/CNC", unitCostUsd: 8.2, note: "Fast prototype, high unit cost" },
        { option: "B", supplierType: "Injection molded", unitCostUsd: 2.9, note: "Needs tooling for scale" },
      ],
      costDriver: "Tooling strategy and finish quality",
    },
    {
      component: "Final assembly + functional test",
      specIntent: "Build, flash firmware, QA smoke test",
      qtyPerUnit: 1,
      unitCostUsd: 2.3,
      alternates: [
        { option: "A", supplierType: "Turnkey EMS", unitCostUsd: 2.3, note: "Lower coordination overhead" },
        { option: "B", supplierType: "Split vendors", unitCostUsd: 1.7, note: "Cheaper but slower orchestration" },
      ],
      costDriver: "Process maturity and automation",
    },
    {
      component: "Packaging + inserts",
      specIntent: "Retail-safe pack with quickstart guide",
      qtyPerUnit: 1,
      unitCostUsd: 0.9,
      alternates: [
        { option: "A", supplierType: "Custom printed pack", unitCostUsd: 0.9, note: "Brand-ready" },
        { option: "B", supplierType: "Plain carton", unitCostUsd: 0.45, note: "Cheapest path for pilot" },
      ],
      costDriver: "Branding and unboxing requirements",
    },
  ];
}

function fallbackBomGeneral() {
  return [
    {
      component: "Primary material set",
      specIntent: "Core product body material",
      qtyPerUnit: 1,
      unitCostUsd: 3.2,
      alternates: [
        { option: "A", supplierType: "Domestic material supplier", unitCostUsd: 3.2, note: "Lower logistics risk" },
        { option: "B", supplierType: "Offshore supplier", unitCostUsd: 2.5, note: "Lower cost, higher lead uncertainty" },
      ],
      costDriver: "Material grade and finish",
    },
    {
      component: "Secondary components",
      specIntent: "Fasteners, inserts, utility parts",
      qtyPerUnit: 1,
      unitCostUsd: 1.1,
      alternates: [
        { option: "A", supplierType: "Catalog parts", unitCostUsd: 1.1, note: "Fast procurement" },
        { option: "B", supplierType: "Custom parts", unitCostUsd: 0.8, note: "Cheaper at volume" },
      ],
      costDriver: "Part count and tolerance stack",
    },
    {
      component: "Conversion process",
      specIntent: "Primary manufacturing operation",
      qtyPerUnit: 1,
      unitCostUsd: 2.4,
      alternates: [
        { option: "A", supplierType: "Prototype process", unitCostUsd: 4.6, note: "Fast setup, expensive unit economics" },
        { option: "B", supplierType: "Production process", unitCostUsd: 2.4, note: "Tooling-dependent, cheaper per unit" },
      ],
      costDriver: "Tooling and cycle time",
    },
    {
      component: "Assembly + QC",
      specIntent: "Final build and inspection",
      qtyPerUnit: 1,
      unitCostUsd: 1.6,
      alternates: [
        { option: "A", supplierType: "Manual line", unitCostUsd: 1.6, note: "Flexible but variable throughput" },
        { option: "B", supplierType: "Semi-automated line", unitCostUsd: 1.2, note: "Lower unit labor at scale" },
      ],
      costDriver: "Labor minutes per unit",
    },
    {
      component: "Packaging + logistics prep",
      specIntent: "Ship-ready packaging and labels",
      qtyPerUnit: 1,
      unitCostUsd: 0.8,
      alternates: [
        { option: "A", supplierType: "Custom packaging", unitCostUsd: 0.8, note: "Market-ready look" },
        { option: "B", supplierType: "Generic packaging", unitCostUsd: 0.45, note: "Lower cost for early runs" },
      ],
      costDriver: "Packaging complexity",
    },
  ];
}

function fallbackShouldCost(project) {
  const profile = inferProfile(project);
  const bom = (profile === "electronics" ? fallbackBomElectronics() : fallbackBomGeneral()).map(withExtCost);

  const materialsUsd = Number(
    bom
      .slice(0, Math.max(1, bom.length - 2))
      .reduce((sum, line) => sum + (line.extCostUsd || 0), 0)
      .toFixed(4),
  );
  const assemblyUsd = Number(
    bom
      .slice(-2, -1)
      .reduce((sum, line) => sum + (line.extCostUsd || 0), 0)
      .toFixed(4),
  );
  const packagingUsd = Number((bom[bom.length - 1]?.extCostUsd || 0).toFixed(4));
  const toolingUsd = profile === "electronics" ? 4500 : 3200;
  const qualityUsd = Number((materialsUsd * 0.04).toFixed(4));
  const logisticsUsd = Number((materialsUsd * 0.1).toFixed(4));
  const dutyUsd = Number((materialsUsd * 0.05).toFixed(4));
  const landedUnitCostUsd = Number(
    (materialsUsd + assemblyUsd + packagingUsd + qualityUsd + logisticsUsd + dutyUsd).toFixed(4),
  );

  return {
    currency: "USD",
    targetVolumeUnits: 500,
    profile,
    bom,
    costBreakdown: {
      materialsUsd,
      assemblyUsd,
      toolingUsd,
      qualityUsd,
      packagingUsd,
      logisticsUsd,
      dutyUsd,
      landedUnitCostUsd,
      firstArticleCostUsd: Number((toolingUsd + landedUnitCostUsd * 50).toFixed(2)),
    },
    assumptions: [
      "Landed cost includes freight + import duties as modeled assumptions.",
      "No custom certification test lab costs included in unit economics.",
      "Supplier payment terms assumed net 30 after initial deposit.",
    ],
    costLevers: [
      "Reduce part count and simplify assembly sequence.",
      "Bundle PCB assembly + final assembly with a single EMS vendor.",
      "Use prototype process first; move to tooling only after demand signal.",
    ],
  };
}

function normalizeShouldCost(candidate, fallback) {
  if (!candidate || typeof candidate !== "object") return fallback;
  const bomRaw = Array.isArray(candidate.bom) ? candidate.bom : [];
  const bom = bomRaw
    .map((line) => withExtCost({
      component: line.component || "Component",
      specIntent: line.specIntent || "",
      qtyPerUnit: line.qtyPerUnit,
      unitCostUsd: line.unitCostUsd,
      alternates: Array.isArray(line.alternates) ? line.alternates : [],
      costDriver: line.costDriver || "",
    }))
    .filter((line) => line.component);
  if (!bom.length) return fallback;

  const materialsUsd = Number(
    bom.reduce((sum, line) => sum + (line.extCostUsd || 0), 0).toFixed(4),
  );
  const provided = candidate.costBreakdown || {};
  const assemblyUsd = Number.isFinite(provided.assemblyUsd) ? provided.assemblyUsd : Number((materialsUsd * 0.18).toFixed(4));
  const packagingUsd = Number.isFinite(provided.packagingUsd) ? provided.packagingUsd : Number((materialsUsd * 0.07).toFixed(4));
  const qualityUsd = Number.isFinite(provided.qualityUsd) ? provided.qualityUsd : Number((materialsUsd * 0.04).toFixed(4));
  const logisticsUsd = Number.isFinite(provided.logisticsUsd) ? provided.logisticsUsd : Number((materialsUsd * 0.1).toFixed(4));
  const dutyUsd = Number.isFinite(provided.dutyUsd) ? provided.dutyUsd : Number((materialsUsd * 0.05).toFixed(4));
  const toolingUsd = Number.isFinite(provided.toolingUsd) ? provided.toolingUsd : fallback.costBreakdown.toolingUsd;
  const landedUnitCostUsd = Number(
    (
      Number.isFinite(provided.landedUnitCostUsd)
        ? provided.landedUnitCostUsd
        : materialsUsd + assemblyUsd + packagingUsd + qualityUsd + logisticsUsd + dutyUsd
    ).toFixed(4),
  );

  return {
    currency: candidate.currency || "USD",
    targetVolumeUnits: Number.isFinite(candidate.targetVolumeUnits) ? candidate.targetVolumeUnits : fallback.targetVolumeUnits,
    profile: candidate.profile || fallback.profile,
    bom,
    costBreakdown: {
      materialsUsd,
      assemblyUsd,
      toolingUsd,
      qualityUsd,
      packagingUsd,
      logisticsUsd,
      dutyUsd,
      landedUnitCostUsd,
      firstArticleCostUsd:
        Number.isFinite(provided.firstArticleCostUsd)
          ? provided.firstArticleCostUsd
          : Number((toolingUsd + landedUnitCostUsd * 50).toFixed(2)),
    },
    assumptions: Array.isArray(candidate.assumptions) && candidate.assumptions.length
      ? candidate.assumptions
      : fallback.assumptions,
    costLevers: Array.isArray(candidate.costLevers) && candidate.costLevers.length
      ? candidate.costLevers
      : fallback.costLevers,
  };
}

export async function buildShouldCostModel({ project }) {
  const fallback = fallbackShouldCost(project);
  const prompt = [
    "Build a should-cost model for a physical product pre-manufacturing stage.",
    "Return strict JSON with keys: currency, targetVolumeUnits, profile, bom, costBreakdown, assumptions, costLevers.",
    "bom must be an array of line items with keys: component, specIntent, qtyPerUnit, unitCostUsd, alternates (array), costDriver.",
    "alternates items must include: option, supplierType, unitCostUsd, note.",
    "costBreakdown keys: materialsUsd, assemblyUsd, toolingUsd, qualityUsd, packagingUsd, logisticsUsd, dutyUsd, landedUnitCostUsd, firstArticleCostUsd.",
    "Keep numbers realistic and conservative. Currency must be USD.",
    `Project idea: ${project.idea}`,
    `Product definition: ${JSON.stringify(project.productDefinition)}`,
    `Constraints: ${JSON.stringify(project.constraints)}`,
  ].join("\n\n");

  const generated = await generateJsonWithFallback({
    prompt,
    maxOutputTokens: 1400,
    fallback: () => fallback,
  });

  return normalizeShouldCost(generated, fallback);
}
