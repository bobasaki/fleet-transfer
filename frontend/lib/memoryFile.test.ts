import { describe, expect, it } from "vitest";
import { toMemoryFile, UnreadablePhotoError } from "./memoryFile";

describe("toMemoryFile", () => {
  it("returns an in-memory copy with the same bytes, name, type and timestamp", async () => {
    const src = new File([new Uint8Array([1, 2, 3])], "racun.jpg", {
      type: "image/jpeg",
      lastModified: 1234,
    });
    const copy = await toMemoryFile(src, "račun");
    expect(copy).not.toBe(src);
    expect(copy.name).toBe("racun.jpg");
    expect(copy.type).toBe("image/jpeg");
    expect(copy.lastModified).toBe(1234);
    expect(Array.from(new Uint8Array(await copy.arrayBuffer()))).toEqual([1, 2, 3]);
  });

  it("throws a Croatian error naming the photo when the file cannot be read", async () => {
    const broken = new File([], "x.jpg", { type: "image/jpeg" });
    broken.arrayBuffer = () => Promise.reject(new DOMException("gone", "NotReadableError"));
    const err = await toMemoryFile(broken, "završno brojilo").catch((e) => e);
    expect(err).toBeInstanceOf(UnreadablePhotoError);
    expect(err.message).toBe(
      "Fotografija (završno brojilo) se ne može pročitati — ukloni je i dodaj ponovno.",
    );
  });
});
