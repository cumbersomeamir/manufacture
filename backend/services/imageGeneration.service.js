import { runCommonImage } from "./commonImage.js";

export async function generateProductConceptImage({
  prompt,
  referenceImageBase64,
  referenceImageMime,
  aspectRatio,
}) {
  return runCommonImage({
    prompt,
    referenceImageBase64,
    referenceImageMime,
    aspectRatio,
  });
}
