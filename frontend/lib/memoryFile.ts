// Copies a picked photo into memory before it goes into the submit FormData.
//
// Android Chrome can hand the page a File backed by a content URI (gallery,
// Google Photos) that is no longer readable — or reads as "changed" — by the
// time fetch() streams the upload. fetch then fails after the CORS preflight
// with an opaque "Failed to fetch", indistinguishable from being offline.
// Reading the bytes up front turns that into an error that names the photo,
// and the in-memory copy can no longer change underneath the upload.

export class UnreadablePhotoError extends Error {
  constructor(public readonly label: string) {
    super(`Fotografija (${label}) se ne može pročitati — ukloni je i dodaj ponovno.`);
    this.name = "UnreadablePhotoError";
  }
}

export async function toMemoryFile(file: File, label: string): Promise<File> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new UnreadablePhotoError(label);
  }
  return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
}
