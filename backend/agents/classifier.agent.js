export function classifyHumanIntervention({
  confidence = 0,
  uncertainties = [],
  legalRisk = false,
  nonStandardTerms = false,
}) {
  if (legalRisk || nonStandardTerms) {
    return {
      requiresHuman: true,
      reason: "Legal or non-standard terms detected",
    };
  }

  if (confidence < 0.6 || (Array.isArray(uncertainties) && uncertainties.length > 0)) {
    return {
      requiresHuman: true,
      reason: "Low confidence or missing supplier details",
    };
  }

  return {
    requiresHuman: false,
    reason: "Confidence threshold met",
  };
}
