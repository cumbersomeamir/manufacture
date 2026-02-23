import { GoogleGenAI, Modality } from "@google/genai";
import { IMAGE_GENERATION_CONSTANTS } from "../constants/imageGeneration.js";

export async function runCommonImage({
  apiKey = process.env.GEMINI_API_KEY,
  prompt,
  referenceImageBase64,
  referenceImageMime = "image/jpeg",
  contentImageBase64,
  contentImageMime = "image/jpeg",
  aspectRatio,
  model = IMAGE_GENERATION_CONSTANTS.MODEL,
  temperature = IMAGE_GENERATION_CONSTANTS.TEMPERATURE,
}) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("prompt is required");
  }

  const client = new GoogleGenAI({ apiKey });
  const aspectRatioPrompt = aspectRatio
    ? `Generate the image with aspect ratio ${aspectRatio}. `
    : "";

  const parts = [];
  if (referenceImageBase64) {
    parts.push({ inlineData: { mimeType: referenceImageMime, data: referenceImageBase64 } });
  }
  if (contentImageBase64) {
    parts.push({ inlineData: { mimeType: contentImageMime, data: contentImageBase64 } });
  }
  parts.push({
    text: `${IMAGE_GENERATION_CONSTANTS.PROMPT}\n\n${aspectRatioPrompt}User request: ${prompt}`,
  });

  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      temperature,
    },
  });

  const responseParts = response?.candidates?.[0]?.content?.parts ?? [];
  const imageParts = responseParts.filter((part) => part.inlineData?.data);
  if (!imageParts.length) {
    throw new Error("No image returned by model");
  }

  const image = imageParts[imageParts.length - 1];
  const mime = image.inlineData?.mimeType || "image/png";

  return {
    image: `data:${mime};base64,${image.inlineData.data}`,
    usage: response?.usageMetadata,
  };
}
