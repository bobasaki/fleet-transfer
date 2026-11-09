export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const DOCUMENT_TYPES = new Set([...IMAGE_TYPES, "application/pdf"]);

export function validateImageFile(file: File): string | null {
  return validateUpload(file, IMAGE_TYPES, "image");
}

export function validateDocumentFile(file: File): string | null {
  return validateUpload(file, DOCUMENT_TYPES, "image or PDF");
}

function validateUpload(
  file: File,
  allowedTypes: Set<string>,
  label: string,
): string | null {
  const mimeType = (file.type || "").toLowerCase();
  if (!allowedTypes.has(mimeType)) {
    return `Unsupported file type '${file.type || "unknown"}'. Upload a supported ${label}.`;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `File is too large. Maximum size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`;
  }

  return null;
}
