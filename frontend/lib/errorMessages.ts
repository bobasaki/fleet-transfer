// Croatian messages for server/runtime errors shown to the driver.
// The submit_transfer Edge Function (supabase/functions/submit_transfer)
// returns English `detail` strings; the UI is Croatian-only, so known strings
// are mapped here and unknown ones get a generic wrapper that preserves the
// raw detail for debugging.

const GENERIC = "Greška pri slanju — pokušaj ponovno.";

// Ordered, first match wins: more specific needles must come before their
// substrings (e.g. the km comparison before "odometer_km", "fx_rate_date"
// before "fx_rate"). Each entry is [needles, message]; any needle matching
// via includes() selects the message.
const RULES: ReadonlyArray<readonly [string[], string]> = [
  [["odometer_km must be >= odometer_km_start"], "Završno stanje brojila mora biti ≥ početnom."],
  [["odometer_km_start"], "Početno stanje brojila nije valjano."],
  [["odometer_km"], "Završno stanje brojila nije valjano."],
  [["transfer_date"], "Datum transfera nije valjan."],
  [["transfer_id"], "Oznaka transfera nije valjana — osvježi stranicu i pokušaj ponovno."],
  [["plate_hr"], "Registracija HR vozila je obavezna."],
  [["dnevnica_location"], "Odabrana destinacija dnevnice nije valjana."],
  [["payout_method"], "Odabrani način isplate nije valjan."],
  [["petrol_card must be 1-25"], "Imaš račune za gorivo — odaberi broj petrol kartice."],
  [["petrol_card"], "Odabrana petrol kartica nije valjana."],
  [["visa_card"], "Odabrana Visa kartica nije valjana."],
  [["enc_device"], "Odabrani ENC uređaj nije valjan."],
  [["receipt category"], "Kategorija jednog od računa nije valjana."],
  [["native_amount", "eur_amount"], "Iznos jednog od računa nije valjan."],
  [["receipt_date", "fx_rate_date"], "Datum jednog od računa nije valjan."],
  [["fx_rate"], "Tečaj jednog od računa nije valjan."],
  [["low confidence"], "Jedan od računa ima nisku pouzdanost i nije potvrđen — potvrdi ga prije slanja."],
  [["upload '"], "Slanje fotografija nije uspjelo — provjeri vezu i pokušaj ponovno."],
  [["db_error"], "Greška pri spremanju u bazu — pokušaj ponovno."],
  [["internal_error"], "Greška na poslužitelju — pokušaj ponovno."],
  [["multipart/form-data", "Field 'payload'", "parse_error"], "Neispravan zahtjev — osvježi stranicu i pokušaj ponovno."],
  // Browser fetch failures: Chrome, Safari, Firefox wordings respectively.
  [["Failed to fetch", "Load failed", "NetworkError"], "Nema veze s poslužiteljem — provjeri internet i pokušaj ponovno."],
];

export function toCroatian(detail: string): string {
  const raw = detail.trim();
  if (!raw) return GENERIC;
  for (const [needles, message] of RULES) {
    if (needles.some((n) => raw.includes(n))) return message;
  }
  return `${GENERIC} (detalj: ${raw})`;
}
