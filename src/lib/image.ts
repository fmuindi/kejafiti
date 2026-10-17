"use client";

// Resizes photos in the browser before upload. Keeps storage and bandwidth costs low and
// makes uploads faster on mobile data. Files the browser cannot decode are returned as-is.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function resizeImage(file: File, maxDim: number, quality = 0.82): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob ? { blob, width, height } : null;
}

export function safeFileName(name: string) {
  const base = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-80);
  return base || "file";
}
