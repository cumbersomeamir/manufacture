import { runCommonImage } from "../../../services/commonImage.js";

export async function runNanoBananaModel({
  prompt,
  referenceImageBase64,
  referenceImageMime = "image/jpeg",
  contentImageBase64,
  contentImageMime = "image/jpeg",
  aspectRatio,
}) {
  return runCommonImage({
    prompt,
    referenceImageBase64,
    referenceImageMime,
    contentImageBase64,
    contentImageMime,
    aspectRatio,
  });
}
