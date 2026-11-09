import exifr from "exifr";

export type PhotoTimeResult = { iso: string; source: "exif" | "now" };

// Reads the capture time of a photo from EXIF DateTimeOriginal.
// Supports JPEG, HEIC, WebP, PNG. Falls back to now() if EXIF is absent.
export async function readPhotoTime(file: File): Promise<PhotoTimeResult> {
  try {
    const exif = await exifr.parse(file, ["DateTimeOriginal"]);
    if (exif?.DateTimeOriginal instanceof Date && !isNaN(exif.DateTimeOriginal.getTime())) {
      return { iso: exif.DateTimeOriginal.toISOString(), source: "exif" };
    }
  } catch {
    // fall through
  }
  return { iso: new Date().toISOString(), source: "now" };
}
