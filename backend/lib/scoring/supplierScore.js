const IMPORT_FEASIBILITY_SCORE = {
  high: 1,
  medium: 0.65,
  low: 0.35,
};

const DISTANCE_COMPLEXITY_SCORE = {
  low: 1,
  medium: 0.7,
  high: 0.45,
};

export function computeSupplierConfidence(supplier) {
  const importScore =
    IMPORT_FEASIBILITY_SCORE[String(supplier.importFeasibility || "").toLowerCase()] ||
    0.5;
  const distanceScore =
    DISTANCE_COMPLEXITY_SCORE[String(supplier.distanceComplexity || "").toLowerCase()] ||
    0.5;

  let dataScore = 0;
  if (Number.isFinite(supplier?.pricing?.unitPrice)) dataScore += 0.25;
  if (Number.isFinite(supplier.moq)) dataScore += 0.25;
  if (Number.isFinite(supplier.leadTimeDays)) dataScore += 0.25;
  if (Number.isFinite(supplier.toolingCost)) dataScore += 0.25;

  const score = importScore * 0.35 + distanceScore * 0.25 + dataScore * 0.4;
  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
}
