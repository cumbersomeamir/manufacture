function toDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursBetween(start, end) {
  if (!start || !end) return null;
  return Number(((end.getTime() - start.getTime()) / 36e5).toFixed(2));
}

function median(values = []) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

function min(values = []) {
  const cleaned = values.filter((value) => Number.isFinite(value));
  if (!cleaned.length) return null;
  return Math.min(...cleaned);
}

function max(values = []) {
  const cleaned = values.filter((value) => Number.isFinite(value));
  if (!cleaned.length) return null;
  return Math.max(...cleaned);
}

function estimateLandedFromShouldCost(project) {
  const landed = project?.outcomeEngine?.shouldCost?.costBreakdown?.landedUnitCostUsd;
  return Number.isFinite(landed) ? landed : null;
}

function findFirstConversationDate(project, predicate) {
  const hit = (project.conversations || [])
    .filter(predicate)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  return toDate(hit?.createdAt);
}

function parseTargetMoq(project) {
  const raw = String(project?.constraints?.moqTolerance || "");
  const numbers = raw.match(/\d+(?:\.\d+)?/g) || [];
  if (!numbers.length) return null;
  return Number(numbers[0]);
}

function parseTargetUnitCost(project) {
  const raw = String(project?.constraints?.budgetRange || "");
  const numbers = raw.match(/\d+(?:\.\d+)?/g) || [];
  if (!numbers.length) return null;
  return Number(numbers[0]);
}

export function computeProjectOutcomeMetrics(project) {
  const now = new Date();
  const createdAt = toDate(project.createdAt);

  const suppliers = project.suppliers || [];
  const quotes = suppliers
    .map((supplier) => Number(supplier?.pricing?.unitPrice))
    .filter((value) => Number.isFinite(value));

  const firstSupplierAt = suppliers.length
    ? min(
      suppliers
        .map((supplier) => toDate(supplier.createdAt)?.getTime())
        .filter((value) => Number.isFinite(value)),
    )
    : null;

  const firstOutreachAt = findFirstConversationDate(
    project,
    (entry) => entry.direction === "outbound" && entry.channel === "email",
  );
  const firstReplyAt = findFirstConversationDate(
    project,
    (entry) => entry.direction === "inbound" && entry.channel === "email",
  );

  const followUpsSent = (project.conversations || []).filter(
    (entry) => entry.direction === "outbound" && entry.metadata?.source === "followup",
  ).length;

  const selectedSupplier = suppliers.find((supplier) => supplier.selected) || null;
  const awardDecision = project?.outcomeEngine?.awardDecision || null;
  const recommendedSupplier = suppliers.find(
    (supplier) => supplier.id === awardDecision?.recommendedSupplierId,
  ) || null;

  const expectedLanded =
    awardDecision?.recommended?.landedUnitCostUsd ||
    recommendedSupplier?.pricing?.unitPrice ||
    selectedSupplier?.pricing?.unitPrice ||
    estimateLandedFromShouldCost(project);

  const targetUnitCost = parseTargetUnitCost(project);
  const targetMoq = parseTargetMoq(project);

  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    leadTime: {
      projectAgeHours: createdAt ? hoursBetween(createdAt, now) : null,
      timeToFirstSupplierHours:
        createdAt && Number.isFinite(firstSupplierAt)
          ? hoursBetween(createdAt, new Date(firstSupplierAt))
          : null,
      timeToFirstOutreachHours: hoursBetween(createdAt, firstOutreachAt),
      timeToFirstQuoteHours: hoursBetween(createdAt, firstReplyAt),
      timeToAwardHours: hoursBetween(createdAt, toDate(awardDecision?.generatedAt)),
    },
    funnel: {
      suppliersIdentified: suppliers.length,
      suppliersContacted: suppliers.filter((supplier) =>
        ["contacted", "responded", "finalized"].includes(String(supplier.status || ""))).length,
      suppliersResponded: suppliers.filter((supplier) => supplier.status === "responded").length,
      quotesComparable: suppliers.filter((supplier) =>
        Number.isFinite(supplier?.pricing?.unitPrice) &&
        Number.isFinite(supplier?.moq) &&
        Number.isFinite(supplier?.leadTimeDays)).length,
      followUpsSent,
      awardRecommended: Boolean(awardDecision?.recommendedSupplierId),
    },
    economics: {
      quotedUnitCostMin: min(quotes),
      quotedUnitCostMedian: median(quotes),
      quotedUnitCostMax: max(quotes),
      expectedLandedUnitCostUsd: Number.isFinite(expectedLanded) ? Number(expectedLanded) : null,
      shouldCostLandedUnitUsd: estimateLandedFromShouldCost(project),
      targetUnitCostUsd: Number.isFinite(targetUnitCost) ? targetUnitCost : null,
      targetMoq: Number.isFinite(targetMoq) ? targetMoq : null,
      savingsVsShouldCostUsd:
        Number.isFinite(expectedLanded) && Number.isFinite(estimateLandedFromShouldCost(project))
          ? Number((estimateLandedFromShouldCost(project) - expectedLanded).toFixed(2))
          : null,
    },
    status: {
      hasShouldCost: Boolean(project?.outcomeEngine?.shouldCost),
      hasVariants: Array.isArray(project?.outcomeEngine?.variants) && project.outcomeEngine.variants.length > 0,
      hasStructuredRfq: Boolean(project?.outcomeEngine?.structuredRfq),
      hasAwardDecision: Boolean(awardDecision),
    },
  };
}
