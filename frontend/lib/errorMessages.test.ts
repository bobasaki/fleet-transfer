import { describe, it, expect } from "vitest";
import { toCroatian } from "./errorMessages";

const GENERIC = "Greška pri slanju — pokušaj ponovno.";

describe("toCroatian", () => {
  it("maps the km comparison rule", () => {
    expect(toCroatian("odometer_km must be >= odometer_km_start")).toBe(
      "Završno stanje brojila mora biti ≥ početnom.",
    );
  });

  it("maps km rules even with the error-code prefix", () => {
    expect(toCroatian("validation_error: odometer_km must be >= odometer_km_start")).toBe(
      "Završno stanje brojila mora biti ≥ početnom.",
    );
  });

  it("distinguishes odometer_km_start from odometer_km", () => {
    expect(toCroatian("odometer_km_start must be an integer between 0 and 9999999")).toBe(
      "Početno stanje brojila nije valjano.",
    );
    expect(toCroatian("odometer_km is required")).toBe(
      "Završno stanje brojila nije valjano.",
    );
  });

  it("maps the petrol coupling rule before the generic petrol rule", () => {
    expect(toCroatian("petrol_card must be 1-25 when gorivo receipts are present")).toBe(
      "Imaš račune za gorivo — odaberi broj petrol kartice.",
    );
    expect(toCroatian("petrol_card '99' is not valid")).toBe(
      "Odabrana petrol kartica nije valjana.",
    );
  });

  it("maps invalid receipt category", () => {
    expect(toCroatian("receipt category 'hrana' is not valid")).toBe(
      "Kategorija jednog od računa nije valjana.",
    );
  });

  it("maps receipt amount, date, and fx errors", () => {
    expect(toCroatian("receipt 'gorivo': native_amount must be a number between 0 and 99999")).toBe(
      "Iznos jednog od računa nije valjan.",
    );
    expect(toCroatian("receipt 'gorivo': receipt_date must be a valid YYYY-MM-DD date")).toBe(
      "Datum jednog od računa nije valjan.",
    );
    // fx_rate_date contains "fx_rate" — the date rule must win
    expect(toCroatian("receipt 'gorivo': fx_rate_date must be a valid YYYY-MM-DD date")).toBe(
      "Datum jednog od računa nije valjan.",
    );
    expect(toCroatian("receipt 'gorivo': fx_rate must be a number between 0 (exclusive) and 10000")).toBe(
      "Tečaj jednog od računa nije valjan.",
    );
  });

  it("maps low-confidence unconfirmed receipts", () => {
    expect(toCroatian("receipt with category 'gorivo' has low confidence and was not confirmed")).toBe(
      "Jedan od računa ima nisku pouzdanost i nije potvrđen — potvrdi ga prije slanja.",
    );
  });

  it("maps upload failures", () => {
    expect(toCroatian("upload 'abc-123/receipt_1.jpg': bucket not found")).toBe(
      "Slanje fotografija nije uspjelo — provjeri vezu i pokušaj ponovno.",
    );
  });

  it("maps db_error and internal_error", () => {
    expect(toCroatian('db_error: duplicate key value violates unique constraint "transfers_pkey"')).toBe(
      "Greška pri spremanju u bazu — pokušaj ponovno.",
    );
    expect(toCroatian("internal_error: TypeError: x is not a function")).toBe(
      "Greška na poslužitelju — pokušaj ponovno.",
    );
  });

  it("maps browser network failures (Chrome/Safari/Firefox)", () => {
    expect(toCroatian("Failed to fetch")).toBe(
      "Nema veze s poslužiteljem — provjeri internet i pokušaj ponovno.",
    );
    expect(toCroatian("Load failed")).toBe(
      "Nema veze s poslužiteljem — provjeri internet i pokušaj ponovno.",
    );
    expect(toCroatian("NetworkError when attempting to fetch resource.")).toBe(
      "Nema veze s poslužiteljem — provjeri internet i pokušaj ponovno.",
    );
  });

  it("wraps unknown details generically, preserving the raw detail", () => {
    const msg = toCroatian("something completely unexpected");
    expect(msg.startsWith(GENERIC)).toBe(true);
    expect(msg).toContain("something completely unexpected");
  });

  it("returns the bare generic message for empty input", () => {
    expect(toCroatian("")).toBe(GENERIC);
    expect(toCroatian("   ")).toBe(GENERIC);
  });
});
