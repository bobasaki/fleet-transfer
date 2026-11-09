import { describe, it, expect } from "vitest";
import { today, fmt2, fmtPhotoTime, isoToLocalDate } from "./format";

describe("today", () => {
  it("returns the current UTC date as YYYY-MM-DD", () => {
    expect(today()).toBe(new Date().toISOString().split("T")[0]);
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("fmt2", () => {
  it("formats with exactly two decimals", () => {
    expect(fmt2(0)).toBe("0.00");
    expect(fmt2(68.4)).toBe("68.40");
    expect(fmt2(12.345)).toBe("12.35");
  });
});

describe("fmtPhotoTime", () => {
  it("renders 24h HH:mm in the local timezone", () => {
    // Build the input from local-time parts so the expectation holds in any TZ.
    const local = new Date(2026, 5, 12, 9, 15, 0);
    expect(fmtPhotoTime(local.toISOString())).toBe("09:15");
  });

  it("never uses 12-hour notation", () => {
    const local = new Date(2026, 5, 12, 17, 5, 0);
    expect(fmtPhotoTime(local.toISOString())).toBe("17:05");
  });
});

describe("isoToLocalDate", () => {
  it("returns the LOCAL date for an ISO timestamp", () => {
    const local = new Date(2026, 5, 12, 0, 30, 0); // 00:30 local — UTC date may differ
    expect(isoToLocalDate(local.toISOString())).toBe("2026-06-12");
  });

  it("zero-pads month and day", () => {
    const local = new Date(2026, 0, 5, 12, 0, 0);
    expect(isoToLocalDate(local.toISOString())).toBe("2026-01-05");
  });
});
